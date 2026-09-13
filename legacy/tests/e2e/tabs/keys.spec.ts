// Every control in the button census, worked from the keyboard (WCAG 2.1.1): it can be reached with Tab, takes the
// focus, and Enter (Space for a checkbox or option) does what a click does. Lists (select) are native and skipped.
import { defineButtons } from "./buttons.suite";
defineButtons("tabs", "keyboard");
