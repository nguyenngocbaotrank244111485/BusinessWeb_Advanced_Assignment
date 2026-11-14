import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SurveyQuestService } from '../services/survey-quest-service';

export const surveyCustomerGuard: CanActivateFn = () => {
  const surveyApi = inject(SurveyQuestService);
  const router = inject(Router);

  return surveyApi.getQuestions().pipe(
    map(() => true),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        return of(router.createUrlTree(['/auth/login'], {
          queryParams: { returnUrl: '/survey' }
        }));
      }
      // A valid but disabled/unauthorized account should see its error;
      // do not incorrectly classify 403 as an anonymous login.
      return of(true);
    })
  );
};