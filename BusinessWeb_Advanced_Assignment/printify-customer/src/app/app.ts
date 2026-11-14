import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './services/auth-service';

@Component({
  selector: 'app-root',
  standalone: false,
  styleUrl: './app.css',
  templateUrl: './app.html'
})
export class App implements OnInit {
  readonly auth = inject(AuthService); // Used by header to show Login OR Logout.
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  searchTerm = '';
  loggingOut = false;

  ngOnInit(): void {
    this.auth.checkSession().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      // It is okay for the homepage to render as guest when backend is unavailable.
      error: () => this.auth.currentUser.set(null)
    });
  }

  onSearchInput(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    void this.router.navigate(['/'], {
      queryParams: this.searchTerm.trim() ? { q: this.searchTerm.trim() } : {},
      fragment: 'products'
    });
  }

  logout(): void {
    if (this.loggingOut) return;
    this.loggingOut = true;
    this.auth.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.loggingOut = false;
        void this.router.navigateByUrl('/');
      },
      error: () => {
        this.loggingOut = false;
        // Do not clear UI session on failed logout: server session may remain valid.
        alert('Đăng xuất chưa thành công. Vui lòng thử lại.');
      }
    });
  }
}