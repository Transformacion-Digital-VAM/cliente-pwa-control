import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AsesorHojaControl } from './asesor-hoja-control';

describe('AsesorHojaControl', () => {
  let component: AsesorHojaControl;
  let fixture: ComponentFixture<AsesorHojaControl>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsesorHojaControl]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AsesorHojaControl);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
