import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminMapaAsesores } from './admin-mapa-asesores';

describe('AdminMapaAsesores', () => {
  let component: AdminMapaAsesores;
  let fixture: ComponentFixture<AdminMapaAsesores>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminMapaAsesores]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminMapaAsesores);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
