import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';

import {
  SubmitSurveyRequest,
  SubmitSurveyResponse,
  SurveyQuestionsResponse
} from '../models/survey.model';

@Service()
export class SurveyQuestService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/survey';

  getQuestions(): Observable<SurveyQuestionsResponse> {
    return this.http.get<SurveyQuestionsResponse>(
      `${this.baseUrl}/questions`,
      { withCredentials: true }
    );
  }

  submitSurvey(payload: SubmitSurveyRequest): Observable<SubmitSurveyResponse> {
    return this.http.post<SubmitSurveyResponse>(
      `${this.baseUrl}/responses`,
      payload,
      { withCredentials: true }
    );
  }
}