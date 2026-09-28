/**
 * The entries of the store zip, in the form fflate's zipSync takes: every
 * folder and file under a root except source maps, named with forward
 * slashes on every platform. Each entry keeps the attributes adm-zip gave it
 * before fflate replaced it: Unix origin, the file's mode and mtime, the
 * MS-DOS directory flag on folders. Folders are stored, files deflated.
 *
 * The tree is walked here, breadth first like Node's own recursive listing,
 * because readdirSync's recursive option only exists from Node 18.17 and
 * 20.1. On the older Node 18 releases package.json allows, the option is
 * ignored and only the top level comes back, which zipped the folders
 * without anything inside them.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function zipEntries(root)
{
	const entries = {};
	const folders = [""];
	for (let index = 0; index < folders.length; index++)
	{
		const folder = folders[index];
		for (const child of readdirSync(join(root, folder)))
		{
			const name = folder ? `${folder}/${child}` : child;
			if (name.endsWith(".map")) continue;
			const stats = statSync(join(root, name));
			const directory = stats.isDirectory();
			const attributes = { os: 3, attrs: ((stats.mode & 0xffff) << 16 | (directory ? 0x10 : 0)) >>> 0, mtime: stats.mtime };
			if (directory)
			{
				entries[`${name}/`] = [new Uint8Array(0), { ...attributes, level: 0 }];
				folders.push(name);
			}
			else
			{
				entries[name] = [readFileSync(join(root, name)), attributes];
			}
		}
	}

	return entries;
}
