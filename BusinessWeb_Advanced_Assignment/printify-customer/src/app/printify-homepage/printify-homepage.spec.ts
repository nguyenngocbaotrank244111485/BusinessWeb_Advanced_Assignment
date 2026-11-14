import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrintifyHomepage } from './printify-homepage';

describe('PrintifyHomepage', () => {
  let component: PrintifyHomepage;
  let fixture: ComponentFixture<PrintifyHomepage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PrintifyHomepage],
    }).compileComponents();

    fixture = TestBed.createComponent(PrintifyHomepage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
