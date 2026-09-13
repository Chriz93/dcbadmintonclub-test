// The Adjust suite on a slow, uneven connection (p63): every reply arrives 20–120 ms late, in a different order than it
// was asked for. The same leagues and reference-model checks as adjust.spec.ts cases 1–60.
import { define } from "./adjust.suite";
define(0, 60, false, true);
