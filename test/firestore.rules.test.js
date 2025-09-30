import { beforeAll, afterAll, afterEach, test, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { readFileSync } from "node:fs";

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1", // ← ここをエミュの実際の値に合わせる
      port: 8080, // ← ここも合わせる（変えてたらその番号）
    },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore(); // ← これ
    await setDoc(doc(db, "threads/ownThread"), { userId: "alice" });
  });
});
afterEach(async () => {
  /* await env.clearFirestore(); 必要なら */
});
afterAll(async () => {
  if (env) await env.cleanup();
});

test("stats は未認証でも read/write できる", async () => {
  const unauth = env.unauthenticatedContext();
  const db = unauth.firestore();
  await assertSucceeds(setDoc(doc(db, "stats/s1"), { v: 1 }));
  await assertSucceeds(getDoc(doc(db, "stats/s1")));
});

test("users: 自分のドキュメントのみ read/write 可、他人は不可", async () => {
  const alice = env.authenticatedContext("alice");
  const aliceDb = alice.firestore();
  await assertSucceeds(setDoc(doc(aliceDb, "users/alice"), { name: "A" }));
  await assertSucceeds(getDoc(doc(aliceDb, "users/alice")));
  await assertFails(getDoc(doc(aliceDb, "users/bob"))); // 他人は読めない
});

test("threads: owner は read/update/delete 可、作成は userId==uid 必須", async () => {
  const alice = env.authenticatedContext("alice");
  const bob = env.authenticatedContext("bob");
  const aliceDb = alice.firestore();
  const bobDb = bob.firestore();

  // create: userId が自分ならOK
  await assertSucceeds(setDoc(doc(aliceDb, "threads/t2"), { userId: "alice" }));
  // create: userId が他人ならNG
  await assertFails(setDoc(doc(bobDb, "threads/t3"), { userId: "alice" }));

  // read: ownerのみ
  await assertSucceeds(getDoc(doc(aliceDb, "threads/ownThread")));
  await assertFails(getDoc(doc(bobDb, "threads/ownThread")));

  // update: ownerのみ
  await assertSucceeds(updateDoc(doc(aliceDb, "threads/ownThread"), { x: 1 }));
  await assertFails(updateDoc(doc(bobDb, "threads/ownThread"), { x: 2 }));
});

test("messages(threads/{threadId}/messages/{id}): owner のみ create/read/update/delete 可", async () => {
  const alice = env.authenticatedContext("alice");
  const bob = env.authenticatedContext("bob");
  const aliceDb = alice.firestore();
  const bobDb = bob.firestore();

  // owner(alice) は作成OK
  await assertSucceeds(
    setDoc(doc(aliceDb, "threads/ownThread/messages/m1"), { body: "hi" })
  );
  await assertSucceeds(getDoc(doc(aliceDb, "threads/ownThread/messages/m1")));
  await assertSucceeds(
    updateDoc(doc(aliceDb, "threads/ownThread/messages/m1"), { body: "yo" })
  );

  // 非owner(bob) はすべてNG
  await assertFails(
    setDoc(doc(bobDb, "threads/ownThread/messages/m2"), { body: "x" })
  );
  await assertFails(getDoc(doc(bobDb, "threads/ownThread/messages/m1")));
  await assertFails(
    updateDoc(doc(bobDb, "threads/ownThread/messages/m1"), { body: "z" })
  );
});
