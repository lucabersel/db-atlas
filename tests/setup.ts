// Tests and benchmarks run ELK in-thread (bundled build); Obsidian uses a Web Worker.
import ELK from "elkjs/lib/elk.bundled.js";
import { setElkEngine } from "../src/layout/elkLayout";

setElkEngine(() => new ELK());
