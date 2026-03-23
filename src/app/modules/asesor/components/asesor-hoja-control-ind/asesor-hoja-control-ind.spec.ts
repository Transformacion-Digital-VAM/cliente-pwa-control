import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AsesorHojaControlInd } from './asesor-hoja-control-ind';

describe('AsesorHojaControlInd', () => {
  let component: AsesorHojaControlInd;
  let fixture: ComponentFixture<AsesorHojaControlInd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsesorHojaControlInd]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AsesorHojaControlInd);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
