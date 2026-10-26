import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

// TEST_REPLSET=1 runs the suite against a replica set so the transaction path is exercised;
// by default it runs on a standalone server, which exercises the compensating-rollback path.
export async function setup() {
  mongod = process.env.TEST_REPLSET
    ? await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    : await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('stayos_test');
}

export async function teardown() {
  await mongod?.stop();
}
