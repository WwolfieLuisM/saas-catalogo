import 'dotenv/config';

async function main(): Promise<void> {
  console.log(
    'Seed pendiente: se implementa en la Fase 2 (SUPER_ADMIN, tenant, taxonomía y reglas de precios).',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
