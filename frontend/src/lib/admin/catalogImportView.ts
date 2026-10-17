export interface OfertaCreate {
  index: number;
  title: string | null;
  slug: string;
  platform: string;
  availability: boolean;
}

export interface OfertaUpdate {
  index: number;
  id: string;
  title: string | null;
  slug: string;
  platform: string;
  fields: string[];
}

export interface OfertaDelete {
  id: string;
  title: string | null;
  slug: string;
}

export interface PlanOfertas {
  create: OfertaCreate[];
  update: OfertaUpdate[];
  delete: OfertaDelete[];
  unchanged: number;
}

export interface ResumenPlan {
  creadas: number;
  actualizadas: number;
  eliminadas: number;
  sinCambios: number;
  total: number;
}

const vacio = (): PlanOfertas => ({ create: [], update: [], delete: [], unchanged: 0 });

export function normalizarPlan(entrada: unknown): PlanOfertas {
  if (typeof entrada !== 'object' || entrada === null) return vacio();
  const plan = entrada as Partial<PlanOfertas>;
  const lista = <T>(valor: unknown): T[] => (Array.isArray(valor) ? (valor as T[]) : []);

  return {
    create: lista<OfertaCreate>(plan.create),
    update: lista<OfertaUpdate>(plan.update),
    delete: lista<OfertaDelete>(plan.delete),
    unchanged: typeof plan.unchanged === 'number' && plan.unchanged >= 0 ? plan.unchanged : 0,
  };
}

export function resumenPlan(plan: PlanOfertas): ResumenPlan {
  const creadas = plan.create.length;
  const actualizadas = plan.update.length;
  const eliminadas = plan.delete.length;

  return {
    creadas,
    actualizadas,
    eliminadas,
    sinCambios: plan.unchanged,
    total: creadas + actualizadas + eliminadas,
  };
}

function plural(cantidad: number, singular: string, plural: string): string {
  return cantidad === 1 ? singular : plural;
}

function linea(cantidad: number, singular: string, pluralForma: string): string {
  if (cantidad === 0) return '';
  return `${cantidad} ${plural(cantidad, singular, pluralForma)}`;
}

export function lineasResumen(resumen: ResumenPlan): string[] {
  return [
    linea(resumen.creadas, 'oferta se creará', 'ofertas se crearán'),
    linea(resumen.actualizadas, 'oferta se actualizará', 'ofertas se actualizarán'),
    linea(resumen.eliminadas, 'oferta se retirará', 'ofertas se retirarán'),
  ].filter((texto) => texto.length > 0);
}

export function hayCambios(resumen: ResumenPlan): boolean {
  return resumen.total > 0;
}

export interface ResultadoImport {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

function participio(cantidad: number, singular: string, pluralForma: string): string {
  return `${cantidad} ${plural(cantidad, singular, pluralForma)}`;
}

export function resumenEjecutado(resultado: ResultadoImport): string[] {
  const lineas = [
    participio(resultado.created, 'oferta creada', 'ofertas creadas'),
    participio(resultado.updated, 'oferta actualizada', 'ofertas actualizadas'),
    participio(resultado.deleted, 'oferta retirada', 'ofertas retiradas'),
    participio(resultado.unchanged, 'oferta sin cambios', 'ofertas sin cambios'),
  ].filter((texto) => !texto.startsWith('0 '));

  return lineas.length > 0 ? lineas : ['No se aplicó ningún cambio'];
}

export function tituloResultado(resultado: ResultadoImport): string {
  const tocoAlgo =
    resultado.created > 0 || resultado.updated > 0 || resultado.deleted > 0;

  return tocoAlgo ? 'Importación aplicada' : 'No había nada que importar';
}

export function puedeEjecutar(resumen: ResumenPlan, confirmado: boolean): boolean {
  return hayCambios(resumen) && confirmado;
}

export function nombreOferta(oferta: { title: string | null; slug: string }): string {
  const titulo = oferta.title?.trim();
  return titulo && titulo.length > 0 ? titulo : oferta.slug;
}

export function etiquetaOferta(oferta: {
  title: string | null;
  slug: string;
  platform?: string;
}): string {
  const nombre = nombreOferta(oferta);
  const plataforma = oferta.platform?.trim();
  return plataforma && plataforma.length > 0 ? `${nombre} · ${plataforma}` : nombre;
}