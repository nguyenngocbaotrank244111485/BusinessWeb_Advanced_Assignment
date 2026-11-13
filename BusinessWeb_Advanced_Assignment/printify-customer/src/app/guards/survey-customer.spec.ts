import { TestBed } from '@angular/core/testing';
import { SurveyCustomer } from './survey-customer';

describe('SurveyCustomer', () => {
  let service: SurveyCustomer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SurveyCustomer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
