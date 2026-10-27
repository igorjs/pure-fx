// SPDX-License-Identifier: Apache-2.0
/** Pool, Channel and Queue basics. */
export async function run(lib, t) {
  const { Pool, Channel, Queue } = lib;

  t.section("Pool");
  let created = 0;
  const pool = Pool.create({ create: async () => ({ id: ++created }), maxSize: 2 });
  const used = await pool.use(async resource => resource.id).run();
  t.check(used.isOk && used.value === 1, "Pool.use hands out a resource");
  const reused = await pool.use(async resource => resource.id).run();
  t.check(reused.isOk && created === 1, "Pool reuses a released resource");
  await pool.drain();

  t.section("Channel");
  const channel = Channel.bounded(10);
  await channel.send(1);
  await channel.send(2);
  channel.close();
  const received = [];
  for await (const value of channel.receive()) received.push(value);
  t.eq(JSON.stringify(received), "[1,2]", "Channel delivers in order");

  t.section("Queue");
  const processed = [];
  const queue = Queue.create({
    handler: async job => {
      processed.push(job.data);
    },
  });
  queue.push("a");
  queue.push("b");
  await queue.drain();
  t.eq(JSON.stringify(processed), '["a","b"]', "Queue runs every job");
  t.eq(queue.processed(), 2, "Queue counts processed jobs");
}
