export interface Integrante {
    id?: string;
    miembroId?: string; // Para identificar si ya existe el miembro
    nombre: string;
    apellidos: string;
    tipoCredito?: string;
    cargo: string;
    pagoPactado: number;
    montoSolicitado?: number;
    tasaInteres?: number;
}

export interface GrupoPayload {
    grupoId?: string; // Para identificar si el grupo ya existe
    nombreGrupo: string;
    clave: string;
    tipoCredito: string;
    cicloActual: number;
    tasa: number;
    diaVisita: string;
    fechaPrimerPago: string;
    horaVisita: string;
    plazoSemanas?: number;
    plazoMeses?: number;
    porcentajeGarantia?: number;
    integrantes: Integrante[];
}
