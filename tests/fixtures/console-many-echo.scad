// UF-19 fixture: enough console output that the log must scroll in both
// interfaces, so scroll POSITION can be asserted rather than mere presence.
// The last echo is a distinct marker, which is what "the newest line" means
// in these tests.

/*[Dimensions]*/
size = 10; // [5:50]

for (i = [1:40]) echo(str("tail-line-", i));
echo(str("tail-newest-marker"));

cube([size, size, size]);
