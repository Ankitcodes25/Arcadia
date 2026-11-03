const mongoose = require('mongoose');

let transactionsSupported = null;

/**
 * Transactions need a replica set (Atlas, or any `rs` deployment) or a
 * sharded cluster. The topology is read once from the server's `hello`
 * reply rather than inferred from a failed write.
 */
async function deploymentSupportsTransactions() {
  if (transactionsSupported === null) {
    const admin = mongoose.connection.db.admin();
    const hello = await admin.command({ hello: 1 })
      .catch(() => admin.command({ isMaster: 1 }));
    transactionsSupported = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  }
  return transactionsSupported;
}

/**
 * Runs `work` inside a MongoDB transaction where the deployment supports one.
 * On a standalone server (local development, or a test database) the same work
 * runs without a session and must rely on its own fail-safe ordering.
 */
async function runInTransactionIfSupported(work) {
  if (!(await deploymentSupportsTransactions())) return work(null);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  deploymentSupportsTransactions,
  runInTransactionIfSupported,
};
