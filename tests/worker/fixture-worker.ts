const fixtureWorker = {
  fetch() {
    return Response.json({ ok: true });
  },
};

export default fixtureWorker;
