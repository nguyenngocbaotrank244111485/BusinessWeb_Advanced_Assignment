import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProtectedFeatureComponent } from './protected-feature-component';

describe('ProtectedFeatureComponent', () => {
  let component: ProtectedFeatureComponent;
  let fixture: ComponentFixture<ProtectedFeatureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ProtectedFeatureComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProtectedFeatureComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
