import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { SurveyQuestService } from '../services/survey-quest-service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormRecord,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { SurveyQuestion, SurveyQuestionsResponse, TamDimension } from '../models/survey.model';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';

type QuestionGroup = { code: TamDimension; title: string; questions: SurveyQuestion[] };

@Component({
  selector: 'app-survey-questions-component',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './survey-questions-component.css',
  templateUrl: './survey-questions-component.html',
})

export class SurveyQuestionsComponent implements OnInit {
  private readonly api = inject(SurveyQuestService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scale = [1, 2, 3, 4, 5];
  readonly ratings = new FormRecord<FormControl<number | null>>({});
  readonly comment = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)]
  });

  readonly groups: QuestionGroup[] = [
    { code: 'PU', title: 'Tính hữu ích', questions: [] },
    { code: 'EOU', title: 'Tính dễ sử dụng', questions: [] },
    { code: 'SAT', title: 'Sự hài lòng', questions: [] },
    { code: 'PI', title: 'Ý định mua hàng', questions: [] }
  ];

  status: SurveyQuestionsResponse | null = null;
  questions: SurveyQuestion[] = [];
  loading = true;
  submitting = false;
  submitted = false;
  showValidation = false;
  loadError = '';
  submitError = '';

  ngOnInit(): void {
    this.loadQuestions();
  }

  loadQuestions(): void {
    this.loading = true;
    this.loadError = '';
    this.status = null;
    this.api.getQuestions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.status = response;
          this.questions = response.questions
            .filter(q => q.isActive)
            .sort((a, b) => a.orderIndex - b.orderIndex);

          // Reset controls when retrying the GET.
          for (const key of Object.keys(this.ratings.controls)) {
            this.ratings.removeControl(key);
          }
          for (const group of this.groups) {
            group.questions = this.questions.filter(q => q.dimension === group.code);
          }
          for (const question of this.questions) {
            this.ratings.addControl(
              question._id,
              new FormControl<number | null>(null, Validators.required)
            );
          }
          if (!response.canSubmit) this.ratings.disable();
          else this.ratings.enable();
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loadError = error.status === 401
            ? 'Vui lòng đăng nhập tài khoản Customer để tham gia khảo sát.'
            : error.status === 403
              ? 'Tài khoản hiện không có quyền tham gia khảo sát.'
              : 'Không tải được khảo sát. Hãy kiểm tra kết nối và thử lại.';
          this.loading = false;
        }
      });
  }

  get answeredCount(): number {
    return this.questions.filter(q => this.ratings.get(q._id)?.value !== null).length;
  }

  get blockMessage(): string {
    switch (this.status?.reason) {
      case 'ALREADY_RESPONDED':
        return 'Tài khoản này đã gửi khảo sát trước đó. PrintiFy cảm ơn bạn!';
      case 'NEED_DESIGN_OR_COMPLETED_ORDER':
        return 'Bạn cần có ít nhất 1 thiết kế đã lưu hoặc 1 đơn hàng COMPLETED để tham gia.';
      case 'NO_ACTIVE_QUESTIONS':
        return 'Khảo sát chưa mở câu hỏi. Bạn vui lòng quay lại sau.';
      default:
        return 'Tạm thời không thể gửi khảo sát.';
    }
  }

  submitSurvey(): void {
    if (!this.status?.canSubmit || this.submitting || this.submitted) return;
    this.showValidation = true;
    this.submitError = '';
    this.ratings.markAllAsTouched();
    this.comment.markAsTouched();

    // Guard against unanswered questions and invalid optional comment.
    if (this.ratings.invalid || this.comment.invalid ||
        this.answeredCount !== this.questions.length) {
      this.submitError = 'Bạn hãy chọn đủ tất cả câu hỏi và kiểm tra phần góp ý.';
      return;
    }

    const answers = this.questions.map(question => ({
      questionId: question._id,
      score: this.ratings.get(question._id)!.value as number
    }));
    this.submitting = true;
    this.api.submitSurvey({ answers, comment: this.comment.value.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting = false;
          this.submitted = true;
          this.ratings.disable();
        },
        error: (error: HttpErrorResponse) => {
          this.submitting = false;
          if (error.status === 409 || error.status === 403) {
            // When eligibility changes, freeze the form; no more POST from UI.
            if (this.status) {
              this.status = {
                ...this.status,
                hasResponded: error.status === 409 || this.status.hasResponded,
                canSubmit: false,
                reason: error.status === 409
                  ? 'ALREADY_RESPONDED'
                  : 'NEED_DESIGN_OR_COMPLETED_ORDER'
              };
            }
            this.ratings.disable();
          }
          this.submitError = error.status === 409
            ? 'Bạn đã gửi khảo sát rồi. Mỗi Customer chỉ được gửi một lần.'
            : error.status === 403
              ? 'Bạn không còn đủ điều kiện tham gia khảo sát.'
              : error.status === 401
                ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
                : error.status === 422
                  ? 'Dữ liệu câu trả lời chưa hợp lệ. Hãy tải lại trang rồi thử lại.'
                  : 'Chưa thể gửi khảo sát. Vui lòng thử lại.';
        }
      });
  }
}
