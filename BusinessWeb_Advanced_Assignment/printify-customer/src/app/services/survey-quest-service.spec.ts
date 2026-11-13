import { TestBed } from '@angular/core/testing';
import { SurveyQuestService } from './survey-quest-service';

describe('SurveyQuestService', () => {
  let service: SurveyQuestService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SurveyQuestService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
