// Console fidelity fixture: echoes a marker so the console log has
// observable per-render content.

/*[Dimensions]*/
size = 10; // [5:50]

echo("fidelity-marker size=", size);

cube([size, size, size]);
