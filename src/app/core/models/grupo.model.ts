export interface Integrante {
    id?: string;
    nombre: string;
    apellidos: string;
    cargo: string;
    pagoPactado: number;
}

export interface GrupoPayload {
    nombreGrupo: string;
    clave: string;
    plazo: number;
    tasa: number;
    diaVisita: string;
    fechaPrimerPago: string;
    horaVisita: string;
    integrantes: Integrante[];
}
