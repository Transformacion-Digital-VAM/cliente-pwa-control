import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminHojaControlInd } from './admin-hoja-control-ind';

describe('AdminHojaControlInd', () => {
  let component: AdminHojaControlInd;
  let fixture: ComponentFixture<AdminHojaControlInd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminHojaControlInd]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminHojaControlInd);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
