import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AsesorHome } from './asesor-home';

describe('AsesorHome', () => {
  let component: AsesorHome;
  let fixture: ComponentFixture<AsesorHome>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsesorHome]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AsesorHome);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
