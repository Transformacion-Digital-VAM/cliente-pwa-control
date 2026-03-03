import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminHojaControl } from './admin-hoja-control';

describe('AdminHojaControl', () => {
  let component: AdminHojaControl;
  let fixture: ComponentFixture<AdminHojaControl>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminHojaControl]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminHojaControl);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
