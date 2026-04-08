import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeGerencia } from './home-gerencia';

describe('HomeGerencia', () => {
  let component: HomeGerencia;
  let fixture: ComponentFixture<HomeGerencia>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeGerencia]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeGerencia);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
