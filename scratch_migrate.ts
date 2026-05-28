import { PrismaClient } from '@prisma/client';

const OLD_DATABASE_URL = 'postgresql://postgres.olwmsuqnmzrfopfjteqr:bX7h3.6%3FkMy%2B%23E%24@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';
const NEW_DATABASE_URL = 'postgresql://postgres.wxkonaftjnowmssjwdcg:vE1XbDxVokJ5FGVP@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

async function run() {
  console.log('Initializing Prisma clients...');
  const prismaOld = new PrismaClient({
    datasources: { db: { url: OLD_DATABASE_URL } }
  });
  const prismaNew = new PrismaClient({
    datasources: { db: { url: NEW_DATABASE_URL } }
  });

  try {
    console.log('Fetching all data from OLD database...');
    const users = await prismaOld.user.findMany();
    const patients = await prismaOld.patient.findMany();
    const templates = await prismaOld.testTemplate.findMany();
    const parameters = await prismaOld.testParameter.findMany();
    const orders = await prismaOld.labOrder.findMany();
    const results = await prismaOld.labResult.findMany();

    console.log(`Retrieved from OLD:
    - Users: ${users.length}
    - Patients: ${patients.length}
    - Test Templates: ${templates.length}
    - Test Parameters: ${parameters.length}
    - Lab Orders: ${orders.length}
    - Lab Results: ${results.length}`);

    console.log('Cleaning up NEW database (reverse topological order)...');
    await prismaNew.labResult.deleteMany();
    await prismaNew.labOrder.deleteMany();
    await prismaNew.testParameter.deleteMany();
    await prismaNew.testTemplate.deleteMany();
    await prismaNew.patient.deleteMany();
    await prismaNew.user.deleteMany();
    console.log('Cleanup complete.');

    console.log('Inserting into NEW database (topological order)...');

    // 1. Users
    if (users.length > 0) {
      console.log('Copying Users...');
      await prismaNew.user.createMany({ data: users });
    }

    // 2. Patients
    if (patients.length > 0) {
      console.log('Copying Patients...');
      await prismaNew.patient.createMany({ data: patients });
    }

    // 3. Test Templates
    if (templates.length > 0) {
      console.log('Copying Test Templates...');
      await prismaNew.testTemplate.createMany({ data: templates });
    }

    // 4. Test Parameters
    if (parameters.length > 0) {
      console.log('Copying Test Parameters...');
      await prismaNew.testParameter.createMany({ data: parameters });
    }

    // 5. Lab Orders
    if (orders.length > 0) {
      console.log('Copying Lab Orders...');
      await prismaNew.labOrder.createMany({ data: orders });
    }

    // 6. Lab Results
    if (results.length > 0) {
      console.log('Copying Lab Results...');
      await prismaNew.labResult.createMany({ data: results });
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error migrating data:', error);
  } finally {
    await prismaOld.$disconnect();
    await prismaNew.$disconnect();
  }
}

run();
