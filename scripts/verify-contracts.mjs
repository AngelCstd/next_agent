import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const lockPath = path.join(repositoryRoot, "contracts.lock");
const contractsDirectory = path.join(repositoryRoot, "src", "contracts");

function parseLock(contents) {
  const entries = [];
  const listedNames = new Set();
  let version;

  for (const [index, line] of contents.split(/\r?\n/u).entries()) {
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("version=")) {
      const match = /^version=([^\s=]+)$/u.exec(line);
      if (!match || version !== undefined) {
        throw new Error(`MALFORMED: invalid version at contracts.lock:${index + 1}.`);
      }
      version = match[1];
      continue;
    }

    const match = /^([0-9a-fA-F]{64})\s+([^\s]+)$/u.exec(line);
    if (!match) {
      throw new Error(`MALFORMED: invalid contract entry at contracts.lock:${index + 1}.`);
    }

    const [, hash, name] = match;
    if (path.basename(name) !== name || listedNames.has(name)) {
      throw new Error(`MALFORMED: invalid contract name at contracts.lock:${index + 1}.`);
    }

    listedNames.add(name);
    entries.push({ hash: hash.toLowerCase(), name });
  }

  if (version === undefined) {
    throw new Error("MALFORMED: contracts.lock has no version entry.");
  }
  if (entries.length === 0) {
    throw new Error("MALFORMED: contracts.lock has no contract entries.");
  }

  return { entries, listedNames, version };
}

function decodeVersion(contents) {
  const text = contents.toString("utf8");
  if (text.endsWith("\r\n")) {
    return text.slice(0, -2);
  }
  if (text.endsWith("\n")) {
    return text.slice(0, -1);
  }
  return text;
}

async function verifyContracts() {
  const diagnostics = [];
  let lock;
  let versionContents;
  let directoryEntries;

  try {
    const [lockContents, vendoredVersion, vendoredEntries] = await Promise.all([
      readFile(lockPath, "utf8"),
      readFile(path.join(contractsDirectory, "VERSION")),
      readdir(contractsDirectory, { withFileTypes: true }),
    ]);
    lock = parseLock(lockContents);
    versionContents = vendoredVersion;
    directoryEntries = vendoredEntries;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[contracts] ${detail.startsWith("MALFORMED:") ? detail : `MISSING: verification input could not be read (${detail}).`}`);
    process.exitCode = 1;
    return;
  }

  const actualVersion = decodeVersion(versionContents);
  if (actualVersion !== lock.version) {
    diagnostics.push(
      `VERSION drift: lock says '${lock.version}', vendored copy says '${actualVersion}'.`,
    );
  }

  for (const { hash: expectedHash, name } of lock.entries) {
    let contents;
    try {
      contents = await readFile(path.join(contractsDirectory, name));
    } catch {
      diagnostics.push(`MISSING: src/contracts/${name} is listed in the lock but absent.`);
      continue;
    }

    const actualHash = createHash("sha256").update(contents).digest("hex");
    if (actualHash !== expectedHash) {
      diagnostics.push(`MODIFIED: src/contracts/${name} does not match contracts.lock.`);
    }
  }

  for (const entry of directoryEntries) {
    if (entry.isFile() && entry.name.endsWith(".ts") && !lock.listedNames.has(entry.name)) {
      diagnostics.push(`UNLISTED: src/contracts/${entry.name} is not in contracts.lock.`);
    }
  }

  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) {
      console.error(`[contracts] ${diagnostic}`);
    }
    console.error("[contracts] Vendored contracts differ from the lock.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `[contracts] OK - vendored copy matches contracts.lock (version ${actualVersion}).`,
  );
}

await verifyContracts();
