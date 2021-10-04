import * as fs from "https://deno.land/std/fs/mod.ts";

const ENTRY_POINT = "src/main.ts";
const BUILD_DIR = "build";

if (!await fs.exists(BUILD_DIR)) {
  await Deno.mkdir("build");
}

const { files } = await Deno.emit(ENTRY_POINT, {
  bundle: "module",
  compilerOptions: {
    target: "esnext",
    lib: ["dom", "esnext"],
  },
});

for (const [filePath, text] of Object.entries(files)) {
  const buildPath = filePath.replace(/^deno:\/\/\//, `${BUILD_DIR}/`);
  await Deno.writeTextFile(buildPath, text);
}
