

test("uploads reject non-video content and oversized declared bodies", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", {
    email: "upload-limits@example.com",
    password: "password-123"
  });

  const badType = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.body.token}`,
      "content-type": "text/plain",
      "content-length": "4"
    },
    body: "test"
  });
  assert.equal(badType.status, 415);

  const oversized = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.body.token}`,
      "content-type": "video/mp4",
      "content-length": String(250 * 1024 * 1024 + 1)
    }
  });
  assert.equal(oversized.status, 413);
});

test("uploads sanitize filenames and retry IDs into a safe storage path", async (t) => {
  const { server, base } = await app();
  t.after(() => server.close());
  const user = await request(base, "/api/auth/register", "POST", {
    email: "upload-names@example.com",
    password: "password-123"
  });

  const response = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${user.body.token}`,
      "content-type": "video/mp4",
      "x-filename": "../unsafe name?.mp4",
      "x-upload-id": "../retry/path"
    },
    body: Buffer.from("video")
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.url, /^\/storage\/uploads\/user-[A-Za-z0-9_-]+-retrypath-__unsafe_name_.mp4$/);
  assert.doesNotMatch(body.url, /\.\.|[/]unsafe name/);
});
