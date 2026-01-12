
// Written by Volksswitch <www.volksswitch.org>
//
// To the extent possible under law, the author(s) have dedicated all
// copyright and related and neighboring rights to this software to the
// public domain worldwide. This software is distributed without any
// warranty.
//
// You should have received a copy of the CC0 Public Domain
// Dedication along with this software.
// If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
//
//
// Version History:
//
// Version 2: added support for tapered circular utensils
// Version 3: added support for a circular loop for use by amputees
//            added support for angled dove tails and dove tail slots
//            added support for changing the distance bewteen dove tail slots (and therefore dove tails)
//
//
//------------------------------------------------------------------
// User Inputs
//------------------------------------------------------------------

/*[Part to Print]*/
part = "palm loop"; // [palm loop,circular loop,utensil holder,thumb loop,circular grip,tool interface,tool cup,tool saddle,rotating tool interface]

/*[Palm Loop Info]*/
palm_loop_height = 30; // [15:75]
palm_loop_length = 80; // [45:125]
palm_loop_width = 8; // [7:60]
//cannot be used with lower tool mount
include_lower_utensil_mount = "yes"; // [yes,no]
//cannot be used with lower utensil mount
include_lower_tool_mount = "no"; // [yes,no]
include_little_finger_tool_mount = "no"; // [yes,no]
include_upper_utensil_mount = "no"; // [yes,no]
//cannot be used with thumb loop mount
include_thumb_rest = "no"; // [yes,no]
//cannot be used with thumb rest or lower utensil mount
include_thumb_loop_mount = "no"; // [yes,no]

/*[Circular Loop Info]*/
circular_loop_diameter = 60; // [30:150]
circular_loop_width = 30; // [6:80]
internal_grips = 0; // [0,2,4,6]
put_break_in_band = "no"; // [yes,no]
width_of_break = 20; // [5:30]
// requires a break in the band
number_of_elastic_slots = 0; //[0,1,2,3]
width_of_each_slot = 20; // [10:40]
height_of_each_slot = 2; // [2:5]
// for use with elastic band with buttonholes
add_post = "no"; // [yes,no]

/*[Utensil Mount Info]*/
utensil_mount_length = 50; //[30:80]
distance_between_slots = 34; //[0:60]
dove_tail_slot_angle = 0; //[-90:90]
dove_tail_size = "regular"; // [regular,large]


/*[Utensil Holder Info]*/
utensil_handle_type = "rectangular"; //[rectangular, circular]
utensil_width_or_diameter = 10; //[2:35]
utensil_height = 3; //[2:35]
utensil_handle_length=80; //[50:150]
utensil_holder_open_on = "thumb end"; //[thumb end, little finger end, both ends]
different_sized_circular_openings="no"; //[yes,no]
specific_thumb_end_diameter=10; //[2:35]
specific_little_finger_end_diameter=10; //[2:35]
// for circular handles only
add_split_in_side = "no"; //[yes,no]
dove_tail_angle = 0; // [-90:90]
end_of_dovetail_chamfers = "no"; // [yes,no]

/*[Thumb Rest/Loop Info]*/
thumb_loop_diameter = 20; //[10:30]
thumb_loop_width = 8; // [4:10]
change_thumb_rest_length = 0; //[-10:10]

/*[Tool Interface Info]*/
interface_width = 20; //[20:60]
interface_height = 25; //[20:40]

/*[Tool Cup Info]*/
cup_diameter = 20; //[5:60]
cup_height = 20; //[20:40]
cup_thickness = 3; //[2:5]

/*[Tool Saddle Info]*/
saddle_width = 20; //[10:60]
saddle_length = 20; //[10:60]
saddle_height = 20; //[10:40]
saddle_thickness = 3; //[2:5]

/*[Circular Grip Info]*/
circular_grip_diameter = 15; //[10:40]


/*[Hidden]*/
 
//general variables
$fn = 100;
fudge = 0.005;
chamfer_size=1.5;

//palm loop variables
palm_loop_delta_offset = 3;

//utensil holder variables
max_end_diameter = max(specific_little_finger_end_diameter,specific_thumb_end_diameter);
utensil_handle_width = (utensil_handle_type != "circular") ? utensil_width_or_diameter+4
						: (different_sized_circular_openings=="no") ? utensil_width_or_diameter+4
						: max_end_diameter+4;
utensil_handle_height = (utensil_handle_type != "circular") ? utensil_height+4 
						: (different_sized_circular_openings=="no") ? utensil_width_or_diameter+4
						: max_end_diameter+4;
uhl = (utensil_handle_type != "circular") ? utensil_handle_length : utensil_handle_length;
v_depth = 1;
gap_width = uhl - 44;
utensil_holder_width = utensil_width_or_diameter + 4;
// utensil_holder_dovetail_length = min(uhl/2, utensil_holder_width/cos(dove_tail_angle) + 5);
utensil_holder_dovetail_length = min(uhl+2,abs(utensil_holder_width/cos(dove_tail_angle)));
dt_width = (dove_tail_size == "regular") ? 8 : 12;
dt_depth = (dove_tail_size == "regular") ? 2 : 3;

//ring variables
ring_thickness = 4;
ring_inner_diameter = thumb_loop_diameter;
ring_outer_diameter = thumb_loop_diameter+ring_thickness;



//-------- Main Program-----------


if(part=="palm loop"){
	palm_loop();
}
else if(part=="circular loop"){
	circular_loop();
}
else if(part=="thumb loop"){
	thumb_loop();
}
else if(part=="circular grip"){
	circular_grip();
}
else if(part=="utensil holder"){
	utensil_holder();
}
else if(part=="tool interface"){
	tool_interface();
}
else if(part=="tool cup"){
	tool_cup();
}
else if(part=="tool saddle"){
	tool_saddle();
}
else if(part=="rotating tool interface"){
	rotating_tool_interface();
}


//--------- Modules --------------

module palm_loop(){
	difference(){
		union(){
			//chamfer outside of palm loop
			outer_chamfered_object("outer palm",palm_loop_width,0,0);//shape_type,shape_height,shape_width,shape_length
			
			//add upper utensil mount		
			if(include_upper_utensil_mount=="yes"){
				translate([utensil_mount_length/2,palm_loop_height,0])	
				difference(){
					upper_utensil_mount(palm_loop_width);
					upper_utensil_mount_slots();
				}
			}
			
			//add little finger tool mount
			if(include_little_finger_tool_mount == "yes") 
				translate([palm_loop_length-(palm_loop_length*.19),palm_loop_height/3,0])
				difference(){
					little_finger_tool_mount();
					little_finger_tool_mount_slot();
				}
			
			//only one type of thumb mount allowed at a time but thumb loop mount cannot be used with lower utensil mount
			if(include_thumb_rest=="yes" && include_thumb_loop_mount=="no") 
				translate([change_thumb_rest_length,0,0])
				thumb_rest_mount(palm_loop_width);
				
			if(include_thumb_loop_mount=="yes" && include_thumb_rest=="no" && include_lower_utensil_mount=="no") 
				difference(){
					thumb_loop_mount();	
					thumb_loop_slots();
				}
			//utensil mount and tool mount cannot be used with thumb loop mount
			if(include_lower_utensil_mount=="yes" && include_lower_tool_mount=="no") {
				translate([25,0,0])
				difference(){
					utensil_mount(palm_loop_width);
					utensil_mount_slots();
				}
			}
			
			translate([25,0,0])
			if(include_lower_tool_mount=="yes" && include_lower_utensil_mount=="no") 
				difference(){
					tool_mount();
					tool_mount_slots();
				}
		}
		//chamfer inside of palm loop
		inner_chamfered_object("inner palm",palm_loop_width,0,0); //shape_type,shape_height,shape_width,shape_length
		
	}
}

module circular_loop(){
	difference(){
		union(){
			//chamfer outside of circular loop
			outer_chamfered_object("outer circle",circular_loop_width,0,0);//shape_type,shape_height,shape_width,shape_length
			
			
			//utensil mount and tool mount cannot be used with thumb loop mount
			translate([0,-circular_loop_diameter/2,0])
			difference(){
				utensil_mount(circular_loop_width);
				utensil_mount_slots();
			}
			
			if (add_post == "yes" && put_break_in_band == "yes"){
				rotate([0,0,-45])
				translate([-circular_loop_diameter/2-5+fudge,0,0])
				union(){
					rotate([0,90,0])
					cylinder(h=6,d=3,center=true);
					
					translate([-2,0,0])
					sphere(d=6);
				}
			}
		}
		//chamfer inside of circle loop
		inner_chamfered_object("inner circle",circular_loop_width,0,0); //shape_type,shape_height,shape_width,shape_length
		
		if (put_break_in_band == "yes") {
			c = PI * circular_loop_diameter;
			g = width_of_break/2;
			r = circular_loop_diameter/2;
			d = r * sin(360*g/c);
			
			translate([-width_of_break/2,circular_loop_diameter/2-15,-circular_loop_width/2-1])
			cube([d*2,30,circular_loop_width+2]);
			
			if (number_of_elastic_slots > 0){
				slot_gap = 3;
				for(i=[0:number_of_elastic_slots-1]){
					angle = ((g + slot_gap + height_of_each_slot/2) + i * (height_of_each_slot + slot_gap)) / c * 360;
					x=g + slot_gap + height_of_each_slot/2;
					
					rotate([0,0,-angle])
					translate([0,circular_loop_diameter/2+1,0])
					cube([height_of_each_slot,6,width_of_each_slot],center=true);
					
					if (add_post == "no"){
						rotate([0,0,angle])
						translate([0,circular_loop_diameter/2+1,0])
						cube([height_of_each_slot,6,width_of_each_slot],center=true);
					}
				}
			}
		}
	}
	
	if (internal_grips > 0){
	
		if (internal_grips == 2 || internal_grips == 6){
			translate([circular_loop_diameter/2-1.3,0,0])
			rotate([0,0,-45])
			prism(2,circular_loop_width-2,true);
			
			translate([-circular_loop_diameter/2+1.3,0,0])
			rotate([0,0,135])
			prism(2,circular_loop_width-2,true);
		}
	
		if (internal_grips >= 4){
			rotate([0,0,30])
			union(){
				translate([circular_loop_diameter/2-1.3,0,0])
				rotate([0,0,-45])
				prism(2,circular_loop_width-2,true);
				
				translate([-circular_loop_diameter/2+1.3,0,0])
				rotate([0,0,135])
				prism(2,circular_loop_width-2,true);
			}

			rotate([0,0,-30])
			union(){
				translate([circular_loop_diameter/2-1.3,0,0])
				rotate([0,0,-45])
				prism(2,circular_loop_width-2,true);
				
				translate([-circular_loop_diameter/2+1.3,0,0])
				rotate([0,0,135])
				prism(2,circular_loop_width-2,true);
			}
		}
	
	}
}

module utensil_holder(){
	hole_offset = (utensil_holder_open_on=="thumb end") ? -3 :
				  (utensil_holder_open_on=="both ends" ) ? 0 :
				   3;
				   
	if(utensil_handle_type=="rectangular"){
		difference(){
			base_utensil_holder(utensil_handle_width,utensil_handle_height);
			
			translate([hole_offset,0,0])
			cube([uhl+2,utensil_height,utensil_width_or_diameter],center=true);
		}
		
	}
	else if(utensil_handle_type=="circular"){
		if(different_sized_circular_openings=="no"){
			difference(){
				base_utensil_holder(utensil_handle_width,utensil_handle_height);
				
				translate([hole_offset,0,0])
				rotate([0,90,0])
				cylinder(h=utensil_handle_length+2,d=utensil_width_or_diameter,center=true);
			}
		}
		else { //different_sized_circular_openings=="yes"
			difference(){
				base_utensil_holder(utensil_handle_width,utensil_handle_height);
				
				//thumb side hole
				translate([-hole_offset,0,0])
				rotate([0,90,0])
				cylinder(h=utensil_handle_length/2+1,d=specific_thumb_end_diameter);

				// little finger side hole
				translate([-utensil_handle_length/2-1-hole_offset,0,0])
				rotate([0,90,0])
				cylinder(h=utensil_handle_length/2+1,d=specific_little_finger_end_diameter);

				//split in side of holder to allow for some stretch
				if (add_split_in_side=="yes"){
					translate([0,0,utensil_handle_width/4+fudge])
					cube([uhl+2,1,utensil_handle_width/2],center=true);
				}
			}
		}
	}
		
	// v shape
	translate([-gap_width/2,utensil_handle_height/2-2+fudge,-utensil_handle_width/2])
	linear_extrude(height=utensil_handle_width)
	polygon([[0,0],[gap_width,0],[gap_width/2,-1]]);
	
	translate([0,utensil_handle_height/2-fudge,0])
	utensil_holder_dove_tails();
}

module base_utensil_holder(utensil_handle_width,utensil_handle_height){
	//two pockets for holding untensil with gap in between
	translate([-uhl/2+11,0,0])
	outer_chamfered_object("box",utensil_handle_width,utensil_handle_height,22); //shape_type,shape_height,shape_width,shape_length
	translate([uhl/2-11,0,0])
	outer_chamfered_object("box",utensil_handle_width,utensil_handle_height,22); //shape_type,shape_height,shape_width,shape_length
	
	//side cover that will be where the dove tails mount when used for forks and spoons
	difference(){
		translate([0,utensil_handle_height/2-2,0])
		outer_chamfered_object("box",utensil_handle_width,4,gap_width+10); //shape_type,shape_height,shape_width,shape_length
		
		translate([0,-2,0])
		cube([gap_width+4,utensil_handle_height+fudge,utensil_handle_width+fudge],center=true);
	}
}

module prism(width,length,chamfer){
	difference(){
		translate([0,0,-length/2])
		linear_extrude(height=length)
		polygon(points=[[0,0],[0,width],[width,0]]);
		if (chamfer){
			translate([fudge,fudge,length/2])
			rotate([0,0,-45])
			rotate([45,0,0])
			cube(width*1.42,true);
			
			translate([fudge,fudge,-length/2])
			rotate([0,0,-45])
			rotate([45,0,0])
			cube(width*1.42,true);
		}
	}
}

module palm_shape(palm_loop_delta_offset){
	offset(delta=palm_loop_delta_offset)
	resize([palm_loop_length,palm_loop_height,0])
	basic_palm_shape();
}

module upper_utensil_mount(width){
	rotate([-90,0,0])
	outer_chamfered_object("box",15,width,utensil_mount_length); //shape_type,shape_height,shape_width,shape_length
}

module upper_utensil_mount_slots(){
	rotate([0,dove_tail_slot_angle,0])
	translate([-distance_between_slots/2,7.5+fudge,-utensil_mount_length/2]) 
	upper_utensil_mount_channel(dt_width,dt_depth);
	
	rotate([0,dove_tail_slot_angle,0])
	translate([distance_between_slots/2,7.5+fudge,-utensil_mount_length/2]) 
	upper_utensil_mount_channel(dt_width,dt_depth);
}

module upper_utensil_mount_channel(width,depth){ //8,2
	linear_extrude(utensil_mount_length)
	polygon(points=[[-width/2,-depth],[width/2,-depth],[width/4,0],[-width/4,0]]);
}

module utensil_mount(width){
	rotate([-90,0,0])
	outer_chamfered_object("box",12+palm_loop_delta_offset,width,utensil_mount_length);
}

module utensil_mount_slots(){
	rotate([0,dove_tail_slot_angle,0])
	translate([-distance_between_slots/2,-7.5-fudge,-uhl*2]) 
	utensil_mount_channel(dt_width,dt_depth,uhl*2);
	
	rotate([0,dove_tail_slot_angle,0])
	translate([distance_between_slots/2,-7.5-fudge,-uhl*2]) 
	utensil_mount_channel(dt_width,dt_depth,uhl*2);
}

module utensil_mount_channel(stylus_width,depth,width){ 
	rotate([0,0,180])
	linear_extrude(width*2)
	polygon(points=[[-stylus_width/2,-depth],[stylus_width/2,-depth],[stylus_width/4,0],[-stylus_width/4,0]]);
}

module utensil_holder_dove_tails(){
	difference(){
		rotate([0,-dove_tail_angle,0])
		union(){
			translate([-distance_between_slots/2,0,0])
			utensil_holder_dove_tail(dt_width,dt_depth,utensil_holder_dovetail_length+25);
			
			translate([distance_between_slots/2,0,0])
			utensil_holder_dove_tail(dt_width,dt_depth,utensil_holder_dovetail_length+25);
		}
		
		if (end_of_dovetail_chamfers == "yes"){
			translate([0,3+fudge,-utensil_handle_width/2-46.5])
			rotate([180,0,0])
			rotate([0,90,0])
			prism(50,uhl*2,false );
			
			translate([0,3+fudge,utensil_handle_width/2+46.5])
			rotate([-90,0,0])
			rotate([0,90,0])
			prism(50,uhl*2,false );
			
			translate([-uhl/2-46.5,3+fudge,0])
			rotate([0,0,-90])
			prism(50,utensil_handle_width*2,false );
			
			translate([uhl/2+46.5,3+fudge,0])
			rotate([0,180,0])
			rotate([0,0,-90])
			prism(50,utensil_handle_width*2,false );
		}
		else{
			translate([0,0,-uhl/2-utensil_width_or_diameter/2-2-fudge])
			cube(uhl,center=true);
			
			translate([0,0,uhl/2+utensil_width_or_diameter/2+2+fudge])
			cube(uhl,center=true);
			
			translate([uhl+fudge,0,0])
			cube(uhl,center=true);
			
			translate([-uhl-fudge,0,0])
			cube(uhl,center=true);
		}
	}
}

module utensil_holder_dove_tail(width,depth,length){ //8,2,?
	translate([0,0,-length/2])
	rotate([0,0,180])
	linear_extrude(height=length)
	polygon(points=[[-width/2,-depth],[width/2,-depth],[width/4,0],[-width/4,0]]);
}

module thumb_loop_mount(){
	// translate([x_offset,19,0])
	translate([0,19,0])
	outer_chamfered_object("thumb loop mount",palm_loop_width,0,0); //shape_type,shape_height,shape_width,shape_length
}

module thumb_rest_mount(width){
	translate([0,-palm_loop_delta_offset/2,0])
	rotate([90,0,0])
	outer_chamfered_object("box",palm_loop_delta_offset,width,palm_loop_length);

	translate([-palm_loop_length/2+palm_loop_delta_offset-3,4.5,0])
	rotate([0,0,105])
	rotate([90,0,0])
	outer_chamfered_object("box",palm_loop_delta_offset,width,palm_loop_height/2);
}

module thumb_loop(){
	difference(){
		union(){
			outer_chamfered_object("outer ring",thumb_loop_width,0,0);
			
			translate([-4,thumb_loop_diameter/2,-thumb_loop_width/2])
			cube([8,2,thumb_loop_width]);
			
			translate([0,thumb_loop_diameter/2+2,0])
			rotate([0,0,90])
			dove_tail(0,thumb_loop_width,2);
		}
		inner_chamfered_object("inner ring",thumb_loop_width,0,0);
	}
}



module thumb_loop_slots(){
		// bottom slots
		translate([-6,-4-fudge,0])
		rotate([0,0,90])
		dove_tail(0,palm_loop_width+fudge*2,2);
		
        translate([3,-4-fudge,0])
		rotate([0,0,90])
		dove_tail(0,palm_loop_width+fudge*2,2);
		
        translate([12,-4-fudge,0])
		rotate([0,0,90])
		dove_tail(0,palm_loop_width+fudge*2,2);
		
		//angled slots
		translate([-16.8-fudge,2,0])
		rotate([0,0,30])
		dove_tail(0,palm_loop_width+fudge*2,2);

		translate([-20.8,9,0])
		rotate([0,0,30])
		dove_tail(0,palm_loop_width+fudge*2,2);

		//corner slot
		translate([-12.45-fudge,-2.7-fudge,0])
		rotate([0,0,60])
		dove_tail(0,palm_loop_width+fudge*2,2);
}

module dove_tail(offset,dove_tail_length,dove_tail_width){
    translate([offset,0,-dove_tail_length/2])
    linear_extrude(height=dove_tail_length)
    polygon(points=[[0,-dove_tail_width/2],[2,-dove_tail_width],[2,dove_tail_width],[0,dove_tail_width/2]]);
}

module circular_grip(){
	difference(){
		outer_chamfered_object("rod",palm_loop_length-20,0,0);
		translate([circular_grip_diameter/2-1,0,0])
		cube([6,palm_loop_width+.5,palm_loop_length-20+fudge],true);
	}
}

		

//-------------------------------------------------------------------------------------------

module inner_chamfered_object(shape_type,shape_height,shape_width,shape_length){
    union(){
        translate([0,0,-shape_height/2])
        linear_extrude(height=shape_height)
        shape(shape_type,0,shape_width,shape_length);
        
        half_inner_chamfer(shape_type,shape_height,shape_width,shape_length);
        mirror([0,0,1]) half_inner_chamfer(shape_type,shape_height,shape_width,shape_length);
    }
}

module half_inner_chamfer(shape_type,shape_height,shape_width,shape_length){
    translate([0,0,shape_height/2-chamfer_size/2+fudge])
	hull(){
		translate([0,0,chamfer_size+fudge])
		linear_extrude(height=fudge)
		offset(delta=chamfer_size)
		shape(shape_type,fudge,shape_width,shape_length);
		
		linear_extrude(height = fudge)
		shape(shape_type,fudge,shape_width,shape_length);
   }
}

module outer_chamfered_object(shape_type,shape_height,shape_width,shape_length){
    difference(){
		translate([0,0,-shape_height/2])
        linear_extrude(height=shape_height)
        shape(shape_type,0,shape_width,shape_length);
        
        half_outer_chamfer(shape_type,shape_height,shape_width,shape_length);
        mirror([0,0,1]) half_outer_chamfer(shape_type,shape_height,shape_width,shape_length);
    }
}

module half_outer_chamfer(shape_type,shape_height,shape_width,shape_length){
    translate([0,0,shape_height/2+fudge])
    difference(){
        translate([0,0,-chamfer_size/2])
        linear_extrude(height=chamfer_size)
        shape(shape_type,fudge,shape_width,shape_length);
        
        translate([0,0,-chamfer_size/2-fudge])
        hull(){
            linear_extrude(height = fudge)
            shape(shape_type,fudge,shape_width,shape_length);
            
            translate([0,0,chamfer_size+fudge])
            linear_extrude(height=fudge)
            offset(delta=-chamfer_size)
            shape(shape_type,fudge,shape_width,shape_length);
        }
    }
}

module shape(shape_type,fudge,shape_width,shape_length){
    if(shape_type == "box"){
        // translate([chamfer_size,chamfer_size,0])
        offset(delta=chamfer_size,chamfer=true)
        square([shape_length-chamfer_size*2,shape_width+fudge-chamfer_size*2],center=true);	
    }
    else if(shape_type=="rod"){
		outer_diameter = circular_grip_diameter;
        circle(d=outer_diameter+fudge,$fn=100);   
    }
    else if(shape_type=="outer ring"){
        circle(d=ring_outer_diameter+fudge,$fn=100);   
    }
    else if(shape_type=="inner ring"){
        circle(d=ring_inner_diameter+fudge,$fn=100);   
    }
    else if(shape_type=="inner palm"){
		simple_palm(0);
	}
    else if(shape_type=="outer palm"){
		simple_palm(palm_loop_delta_offset);
	}
    else if(shape_type=="inner circle"){
        circle(d=circular_loop_diameter+fudge,$fn=100);   
	}
    else if(shape_type=="outer circle"){
		circle(d=circular_loop_diameter+5);
	}
    else if(shape_type=="thumb loop mount"){
		thumb_loop_mount_shape();
	}
	else{
	}
}

module simple_palm(pldo){
	// $fn=100;
	pointer_dia=18;
	little_finger_dia=16;
	palm_back_circle_dia=100;
	
	offset(delta=pldo)
	resize([palm_loop_length,palm_loop_height,0])
	hull(){
		//pointer circle
		translate([0,pointer_dia,0])
		circle(pointer_dia);

		//little finger circle
		translate([65+17/2,little_finger_dia,0])
		circle(little_finger_dia);

		//back of the hand radius
		translate([28,-60,0])
		difference(){
			circle(palm_back_circle_dia);
			translate([0,-10,0])
			square([210,190],center=true);
			translate([-56,50,0])
			square([50,100],center=true);
		}
	}
}

module thumb_loop_mount_shape(){
	union(){
		intersection(){
			offset(delta=10,chamfer=true)
			circle(r=15,$fn=6);
			translate([-7,-14,0])
			square([50,20],center=true);
		}
		translate([0,-23,0])
		square([20,10]);
	}
}

module tool_interface(){
	chamf = 1;
	interface_length = 50;

	h = interface_height - 2*chamf;
	l = interface_length - 2*chamf;
	w = interface_width - 2*chamf;
	
	difference(){
		translate([-interface_length/2,interface_width/2,-interface_height/2])
		rotate([90,0,0])
		union(){
			intersection(){
				translate([chamf,chamf,0])
				linear_extrude(height = interface_width)
				offset(delta=chamf,chamfer = true)
				square([l,h]);

				translate([chamf,interface_height+chamf,chamf])
				rotate([90,0,0])
				linear_extrude(height = interface_height+2*chamf)
				offset(delta=chamf,chamfer = true)
				square([l,w]);
				
				translate([interface_length,chamf,chamf])
				rotate([0,-90,0])
				linear_extrude(height = interface_length)
				offset(delta=chamf,chamfer = true)
				square([w,h]);
			}
			translate([0,interface_height,interface_width/2])
			tool_interface_dove_tails();	
		}
		
		translate([0,0,-interface_height/2+0.5])
		tool_fin();
		
		rotate([0,0,90])
		translate([0,0,-interface_height/2+0.5])
		tool_fin();
		
		translate([25-10,0,0])
		rotate([0,0,90])
		translate([0,0,-interface_height/2+0.5])
		tool_fin();
		
		translate([-25+10,0,0])
		rotate([0,0,90])
		translate([0,0,-interface_height/2+0.5])
		tool_fin();
		
		translate([-24.5,0,interface_height/2 - 25 - 5])
		rotate([0,90,0])
		tool_fin();
		
		translate([24.5,0,interface_height/2 - 25 - 5])
		rotate([0,-90,0])
		tool_fin();
		
		
		// //various chamfers and counter sinks
		translate([0,-interface_width/2,-interface_height/2+10])
		rotate([-90,0,0])
		basic_chamfer();
		
		translate([0,interface_width/2,-interface_height/2+10])
		rotate([90,180,0])
		basic_chamfer();
		
		translate([-25+10,-interface_width/2,-interface_height/2+10])
		rotate([-90,0,0])
		basic_chamfer();
		
		translate([-25+10,interface_width/2,-interface_height/2+10])
		rotate([90,180,0])
		basic_chamfer();
		
		translate([25-10,-interface_width/2,-interface_height/2+10])
		rotate([-90,0,0])
		basic_chamfer();
		
		translate([25-10,interface_width/2,-interface_height/2+10])
		rotate([90,180,0])
		basic_chamfer();
		
		translate([interface_length/2,0,-interface_height/2+10])
		rotate([-90,0,0])
		rotate([0,-90,0])
		basic_chamfer();
		
		translate([-interface_length/2,0,-interface_height/2+10])
		rotate([-90,0,0])
		rotate([0,90,0])
		basic_chamfer();
		
		translate([-interface_length/2+10,0,-interface_height/2])
		rotate([0,0,90])
		basic_chamfer();
		
		translate([interface_length/2-10,0,-interface_height/2])
		rotate([0,0,-90])
		basic_chamfer();
	}
}

module basic_chamfer(){
		cylinder(h=5,d1=10,d2=5,center=true);
		
		// translate([0,5,0])
		// linear_extrude(height=5,scale=[.5,1],center=true)
		// square([6,11],center=true);

}


module tool_fin(){
	translate([-25.5,0,9.5])
	rotate([0,90,0])
	cylinder(d=5.25,h=51);

	translate([0,0,5])
	cube([51,3.25,12],center = true);
}

module tool_interface_dove_tails(){
	difference(){
		union(){
			translate([11,0,0]) tool_interface_dove_tail(interface_width);
			translate([39,0,0]) tool_interface_dove_tail(interface_width);
		}
		translate([25,3+fudge,-interface_width/2-fudge])
		rotate([180,0,0])
		rotate([0,90,0])
		prism(3.5,50,false);
		
		translate([25,3+fudge,interface_width/2+fudge])
		rotate([-90,0,0])
		rotate([0,90,0])
		prism(3.5,50,false);
	}
}

module tool_interface_dove_tail(dove_tail_length){ 
	translate([0,0,-dove_tail_length/2])
	rotate([0,0,180])
	linear_extrude(height=dove_tail_length)
	polygon(points=[[-5.5,-2.5],[5.5,-2.5],[2.5,0],[-2.5,0]]);
}


module tool_cup(){
	difference(){
		cylinder(h = cup_height+ cup_thickness, d = cup_diameter + 2*cup_thickness);
		
		translate([0,0,-fudge])
		cylinder(h = cup_height, d = cup_diameter);
		
		translate([0,0,-fudge])
		cylinder(h=cup_thickness,d1=cup_diameter+cup_thickness/2,d2=cup_diameter-cup_thickness/2);
	}

	translate([0,0,cup_height+ cup_thickness-fudge])
	union(){
		translate([0,0,0])
		linear_extrude(height=10)
		offset(delta=1,chamfer=true)
		square([cup_diameter,1],center = true);
		
		
		translate([0,0,10])
		rotate([0,90,0])
		cylinder(h=cup_diameter+1,d=5,center=true);
		
		translate([-cup_diameter/2-1.5,0,10])
		rotate([0,-90,0])
		cylinder(h=2,d1=5,d2=2,center=true);
		
		translate([cup_diameter/2+1.5,0,10])
		rotate([0,90,0])
		cylinder(h=2,d1=5,d2=2,center=true);
	}
}

module tool_saddle(){
	translate([-(saddle_width+2*saddle_thickness)/2,-(saddle_length)/2])
	difference(){
		cube([saddle_width+2*saddle_thickness,saddle_length,saddle_height+saddle_thickness]);
		
		translate([saddle_thickness,-fudge,-fudge])
		cube([saddle_width,saddle_length+2*fudge,saddle_height+2*fudge]);
	}

	translate([0,0,saddle_height+saddle_thickness-fudge])
	union(){
		rotate([0,0,90])
		linear_extrude(height=10)
		square([saddle_length,3],center = true);
		
		
		translate([0,0,10])
		rotate([0,90,90])
		cylinder(h=saddle_length,d=5,center=true);
		
		// translate([-(saddle_width+2*saddle_thickness)/2-1+fudge,0,10])
		// rotate([0,-90,0])
		// cylinder(h=2,d1=5,d2=2,center=true);
		
		// translate([(saddle_width+2*saddle_thickness)/2+1-fudge,0,10])
		// rotate([0,90,0])
		// cylinder(h=2,d1=5,d2=2,center=true);
	}
}

module tool_mount(){
	translate([0,palm_loop_delta_offset-2,0])	
	rotate([-90,0,0])
	outer_chamfered_object("box",12+palm_loop_delta_offset,palm_loop_width,48);
}

module tool_mount_slots(){
	translate([-14,-palm_loop_delta_offset-3.5-fudge,-palm_loop_width]) 
	tool_mount_channel(12,3);
	
	translate([14,-palm_loop_delta_offset-3.5-fudge,-palm_loop_width]) 
	tool_mount_channel(12,3);
}

module tool_mount_channel(width,depth){ 
	rotate([0,0,180])
	linear_extrude(palm_loop_width*2)
	polygon(points=[[-width/2,-depth],[width/2,-depth],[width/4,0],[-width/4,0]]);
}

module little_finger_tool_mount(){
	rotate([-90,0,90])
	outer_chamfered_object("box",12+palm_loop_delta_offset,palm_loop_width,20);
}

module little_finger_tool_mount_slot(){
	translate([(12+palm_loop_delta_offset)/2+fudge,0,-palm_loop_width])
	rotate([0,0,90])
	tool_mount_channel(12,3);
}

module rotating_tool_interface(){
	union(){
		difference(){
			cylinder(h=9,d=28);
			
			translate([0,0,-fudge])
			cylinder(h=7,d=22.1);
		}
		
		translate([0,0,9-fudge])
		rotate([90,0,0])
		difference(){
			translate([0,0,0]) tool_interface_dove_tail(28);
			
			translate([0,3,-14-fudge])
			rotate([180,0,0])
			rotate([0,90,0])
			prism(3.5,50,false);
			
			translate([0,3,14++fudge])
			rotate([-90,0,0])
			rotate([0,90,0])
			prism(3.5,50,false);
		}
	}
	
	translate([25,25,0])
	union(){
		difference(){
			cylinder(h=16, d=28);
				
			translate([0,0,0.5])
			tool_fin();
		}

	
		translate([0,0,16-fudge])
		cylinder(h=1,d=11);
		
		translate([0,0,17-fudge])
		cylinder(h=6,d=8.2);
	}
	

}
