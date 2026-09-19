// Animation fixture (F5): geometry that visibly depends on $t, so each frame
// is a genuinely different render rather than a cache hit.
size = 10;

rotate([0, 0, $t * 360])
  translate([size, 0, 0])
    cube(size, center = true);
