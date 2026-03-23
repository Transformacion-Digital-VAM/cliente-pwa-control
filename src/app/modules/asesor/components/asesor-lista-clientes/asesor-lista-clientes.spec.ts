import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AsesorListaClientes } from './asesor-lista-clientes';

describe('AsesorListaClientes', () => {
  let component: AsesorListaClientes;
  let fixture: ComponentFixture<AsesorListaClientes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AsesorListaClientes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AsesorListaClientes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
