export interface Integrante {
    id?: string;
    nombre: string;
    apellidos: string;
    tipoCredito?: string;
    cargo: string;
    pagoPactado: number;
}

export interface GrupoPayload {
    nombreGrupo: string;
    clave: string;
    tipoCredito: string;
    cicloActual: number;
    tasa: number;
    diaVisita: string;
    fechaPrimerPago: string;
    horaVisita: string;
    integrantes: Integrante[];
}
