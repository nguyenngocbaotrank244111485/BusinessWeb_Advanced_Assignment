import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Address, MAX_ADDRESSES, ProfileService } from '../../services/profile-service';
import { AuthService } from '../../services/auth-service';
import { TIERS, membershipOf } from '../../models/membership.model';

type Tab = 'info' | 'addresses' | 'password';
const TABS: Tab[] = ['info', 'addresses', 'password'];
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MAX = 5 * 1024 * 1024;
const AVATAR_SIZE = 256;

/** Mật khẩu mới ≥ 8 ký tự, có cả chữ và số */
const strongPassword = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '');
  if (!v) return null;
  return /[A-Za-z]/.test(v) && /\d/.test(v) ? null : { weak: true };
};
/** Ngày sinh: không ở tương lai, từ năm 1900, đủ 10 tuổi */
const validBirthday = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '');
  if (!v) return null;
  const d = new Date(v + 'T00:00:00');
  if (isNaN(d.getTime()) || d.getFullYear() < 1900) return { birthday: true };
  const min = new Date();
  min.setFullYear(min.getFullYear() - 10);
  return d > min ? { birthday: true } : null;
};
/** Không chấp nhận chuỗi chỉ có khoảng trắng */
const notBlank = (c: AbstractControl): ValidationErrors | null =>
  String(c.value ?? '').trim() || !c.value ? null : { blank: true };

/**
 * C18 – Tài khoản & sổ địa chỉ (/account/profile?tab=info|addresses|password)
 * 3 tab dùng chung 1 trang (V4.1 gộp CRUD địa chỉ vào PUT /users/me).
 */
@Component({
  selector: 'app-profile-page',
  standalone: false,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly profiles = inject(ProfileService);

  readonly maxAddresses = MAX_ADDRESSES;
  readonly provinces = toSignal(this.profiles.provinces$, { initialValue: [] as string[] });
  readonly tab = signal<Tab>('info');
  readonly loading = signal(true);
  readonly toast = signal<{ type: 'ok' | 'error'; text: string } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly profile = this.profiles.profile;
  /** Mặc định lên đầu */
  readonly addresses = computed(() =>
    [...(this.profile()?.addresses ?? [])].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
  );
  /** Gợi ý phường/xã từ các địa chỉ đã có (chưa có bộ dữ liệu phường/xã đầy đủ) */
  readonly wardHints = computed(() => [...new Set(this.addresses().map((a) => a.ward))]);

  // ---------- Tab Thông tin ----------
  readonly infoForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100), notBlank]],
    nickname: ['', [Validators.maxLength(30)]],
    birthday: ['', [validBirthday]],
  });
  /** Ngày lớn nhất cho ô chọn ngày sinh (đủ 10 tuổi) */
  readonly maxBirthday = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 10);
    return d.toISOString().slice(0, 10);
  })();
  readonly tiers = TIERS;
  readonly membership = computed(() => {
    const m = this.profile()?.membership;
    return membershipOf(m?.totalSpent ?? 0, m?.points ?? 0);
  });
  readonly avatarDraft = signal<string | null | undefined>(undefined); // undefined = chưa đổi

  // ---------- Tab Sổ địa chỉ ----------
  readonly dialog = signal<{ mode: 'add' | 'edit'; id?: string } | null>(null);
  readonly confirmDelete = signal<Address | null>(null);
  readonly addressForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100), notBlank]],
    phone: ['', [Validators.required, Validators.pattern(/^0\d{9}$/)]],
    province: ['', Validators.required],
    ward: ['', [Validators.required, Validators.maxLength(100), notBlank]],
    detail: ['', [Validators.required, Validators.maxLength(200), notBlank]],
    isDefault: [false],
  });

  // ---------- Tab Đổi mật khẩu ----------
  readonly showPw = signal(false);
  readonly pwBusy = signal(false);
  readonly passwordForm = this.fb.nonNullable.group(
    {
      current: ['', Validators.required],
      next: ['', [Validators.required, Validators.minLength(8), strongPassword]],
      confirm: ['', Validators.required],
    },
    {
      validators: (g: AbstractControl): ValidationErrors | null => {
        const { current, next, confirm } = g.value as { current: string; next: string; confirm: string };
        const errors: ValidationErrors = {};
        if (confirm && next !== confirm) errors['mismatch'] = true;
        if (current && next && current === next) errors['same'] = true;
        return Object.keys(errors).length ? errors : null;
      },
    },
  );

  async ngOnInit(): Promise<void> {
    this.route.queryParamMap.subscribe((q) => {
      const t = q.get('tab') as Tab;
      this.tab.set(TABS.includes(t) ? t : 'info');
    });
    const p = await this.profiles.load();
    if (p) this.fillInfo();
    this.loading.set(false);
  }

  setTab(t: Tab): void {
    void this.router.navigate([], { queryParams: { tab: t === 'info' ? null : t }, replaceUrl: true });
  }

  invalid(form: 'info' | 'address' | 'password', key: string): boolean {
    const g: AbstractControl = form === 'info' ? this.infoForm : form === 'address' ? this.addressForm : this.passwordForm;
    const c = g.get(key);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  // =====================================================================
  // Thông tin
  // =====================================================================

  onAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return this.showToast('error', 'Ảnh đại diện phải là JPG, PNG hoặc WebP.');
    if (file.size > AVATAR_MAX) return this.showToast('error', 'Ảnh đại diện tối đa 5 MB.');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // cắt vuông giữa ảnh, thu về 256px để lưu nhẹ
      const side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = AVATAR_SIZE;
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      this.avatarDraft.set(c.toDataURL('image/jpeg', 0.88));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      this.showToast('error', 'Không đọc được ảnh.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  removeAvatar(): void {
    this.avatarDraft.set(null);
  }

  readonly avatarShown = computed(() => {
    const d = this.avatarDraft();
    return d === undefined ? this.profile()?.avatar ?? null : d;
  });

  readonly infoChanged = computed(() => this.avatarDraft() !== undefined);

  private fillInfo(): void {
    const p = this.profile();
    this.infoForm.setValue({ name: p?.name ?? '', nickname: p?.nickname ?? '', birthday: p?.birthday ?? '' });
    this.infoForm.markAsPristine();
  }

  saveInfo(): void {
    this.infoForm.markAllAsTouched();
    if (this.infoForm.invalid) return;
    const v = this.infoForm.getRawValue();
    const changes: { name: string; nickname: string; birthday: string | null; avatar?: string | null } = {
      name: v.name.trim(),
      nickname: v.nickname.trim(),
      birthday: v.birthday || null,
    };
    if (this.avatarDraft() !== undefined) changes.avatar = this.avatarDraft()!;
    if (!this.profiles.update(changes)) return this.showToast('error', 'Không lưu được (bộ nhớ trình duyệt đầy).');
    this.avatarDraft.set(undefined);
    this.infoForm.markAsPristine();
    this.showToast('ok', 'Đã cập nhật thông tin tài khoản.');
  }

  resetInfo(): void {
    this.fillInfo();
    this.avatarDraft.set(undefined);
  }

  // =====================================================================
  // Sổ địa chỉ
  // =====================================================================

  openAdd(): void {
    if (this.addresses().length >= MAX_ADDRESSES) {
      return this.showToast('error', `Sổ địa chỉ tối đa ${MAX_ADDRESSES} địa chỉ. Hãy xóa bớt trước khi thêm.`);
    }
    const p = this.profile();
    this.addressForm.reset({
      name: p?.name ?? '',
      phone: '',
      province: '',
      ward: '',
      detail: '',
      isDefault: this.addresses().length === 0,
    });
    this.dialog.set({ mode: 'add' });
  }

  openEdit(a: Address): void {
    this.addressForm.reset({ ...a });
    this.dialog.set({ mode: 'edit', id: a._id });
  }

  closeDialog(): void {
    this.dialog.set(null);
  }

  saveAddress(): void {
    this.addressForm.markAllAsTouched();
    const d = this.dialog();
    if (this.addressForm.invalid || !d) return;
    const v = this.addressForm.getRawValue();
    const clean = { name: v.name.trim(), phone: v.phone.trim(), province: v.province, ward: v.ward.trim(), detail: v.detail.trim() };
    let list = [...(this.profile()?.addresses ?? [])];
    // địa chỉ đầu tiên luôn là mặc định
    const isDefault = v.isDefault || list.length === 0 || (d.mode === 'edit' && list.length === 1);
    if (d.mode === 'add') {
      list.push({ _id: this.profiles.newAddressId(), ...clean, isDefault });
    } else {
      list = list.map((a) => (a._id === d.id ? { ...a, ...clean, isDefault: isDefault || a.isDefault } : a));
    }
    const target = d.mode === 'add' ? list[list.length - 1]._id : d.id!;
    if (isDefault) list = list.map((a) => ({ ...a, isDefault: a._id === target }));
    if (!this.profiles.update({ addresses: list })) return this.showToast('error', 'Không lưu được địa chỉ.');
    this.dialog.set(null);
    this.showToast('ok', d.mode === 'add' ? 'Đã thêm địa chỉ mới.' : 'Đã cập nhật địa chỉ.');
  }

  setDefault(a: Address): void {
    const list = (this.profile()?.addresses ?? []).map((x) => ({ ...x, isDefault: x._id === a._id }));
    if (this.profiles.update({ addresses: list })) this.showToast('ok', 'Đã đặt làm địa chỉ mặc định.');
  }

  deleteAddress(): void {
    const a = this.confirmDelete();
    this.confirmDelete.set(null);
    if (!a) return;
    let list = (this.profile()?.addresses ?? []).filter((x) => x._id !== a._id);
    // xóa địa chỉ mặc định -> địa chỉ còn lại đầu tiên thành mặc định
    if (a.isDefault && list.length) list = list.map((x, i) => ({ ...x, isDefault: i === 0 }));
    if (!this.profiles.update({ addresses: list })) return this.showToast('error', 'Không xóa được địa chỉ.');
    this.showToast(
      'ok',
      a.isDefault && list.length ? `Đã xóa. "${list[0].detail}" được đặt làm địa chỉ mặc định mới.` : 'Đã xóa địa chỉ.',
    );
  }

  // =====================================================================
  // Đổi mật khẩu / đăng xuất
  // =====================================================================

  changePassword(): void {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid || this.pwBusy()) return;
    const v = this.passwordForm.getRawValue();
    this.pwBusy.set(true);
    this.profiles.changePassword(v.current, v.next).subscribe((r) => {
      this.pwBusy.set(false);
      if (r === 'OK') {
        this.passwordForm.reset();
        this.showToast('ok', 'Đã đổi mật khẩu.');
      } else if (r === 'WRONG') {
        this.passwordForm.controls.current.setErrors({ wrong: true });
      } else {
        this.showToast('error', 'Chưa kết nối được máy chủ nên chưa đổi được mật khẩu (bản demo).');
      }
    });
  }

  logout(): void {
    this.auth.logout().subscribe({ next: () => this.router.navigateByUrl('/') });
  }

  private showToast(type: 'ok' | 'error', text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ type, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
