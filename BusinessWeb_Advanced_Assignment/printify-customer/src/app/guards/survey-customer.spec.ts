import { surveyCustomerGuard } from './survey-customer';

describe('surveyCustomerGuard', () => {
  it('is a CanActivate function', () => {
    expect(typeof surveyCustomerGuard).toBe('function');
  });
});
