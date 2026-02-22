# OpenSCAD Complete Documentation Reference

> Full 1:1 conversion of the OpenSCAD Wikibooks Tutorial and User Manual (47 PDFs) into a single AI-readable markdown document.
> Source: [OpenSCAD Tutorial](https://en.wikibooks.org/wiki/OpenSCAD_Tutorial) and [OpenSCAD User Manual](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual) on Wikibooks.
> Use this document as a comprehensive reference when generating, validating, or modifying `.scad` code.

---

# Part I: OpenSCAD Tutorial

## Introduction

### About OpenSCAD

OpenSCAD is a solid 3D CAD modelling software that enables the creation of CAD models through a scripting file. The domain specific language designed for this purpose allows the creation of fully parametric models by combining and transforming available primitives as well as custom objects.

### About this tutorial

This tutorial assumes zero programming or CAD knowledge and is designed to guide you step by step through examples and exercises that will quickly build your understanding and provide you with the right tools to create your own models. Emphasis is placed on parametric design principles that will allow you to rapidly modify your creations and build your own library of reusable and combinable models.

The majority of presented examples and solutions to exercises are available as separate OpenSCAD scripts [here](https://github.com/openscad/documentation/tree/master/OpenSCAD_Tutorial/Tutorial_Files).

As of 29-11-2019 this tutorial as well as all accompanying material were completely developed as a Google Season of Docs project.

---

## Table of Contents

### Chapter 1

1. A few words about OpenSCAD
2. Getting started with the Tutorial
3. Basic information about the OpenSCAD environment
4. Creating your first object
5. Creating a slightly different cube
6. Adding more objects and translating objects
7. The cylinder primitive and rotating objects
8. Completing your first model
9. Creating a second model

### Chapter 2

1. Scaling parts or the whole model
2. Quick quiz
3. Parameterizing parts of your model
4. Parameterizing more parts of your model
5. Challenge
6. Parameterizing your own models

### Chapter 3

1. The sphere primitive and resizing objects
2. Combining objects in other ways

### Chapter 4

1. Defining and using modules
2. Parameterizing modules
3. Defining default values of module's parameters
4. Separating the whole model into modules

### Chapter 5

1. Creating and utilizing modules as separate scripts
2. Using a script with multiple modules
3. Using the MCAD library
4. Creating even more parameterizable modules
5. Challenge

### Chapter 6

1. OpenSCAD variables
2. Conditional variable assignment
3. More conditional variable assignments
4. Conditional creation of objects – If statement
5. Challenge

### Chapter 7

1. Creating repeating patterns of parts/models – For loops
2. Creating more complex patterns
3. Challenge
4. Creating patterns of patterns – Nested for loops

### Chapter 8

1. Rotationally extruding 3D objects from 2D objects
2. Challenge
3. Linearly extruding 3D objects from 2D objects

### Chapter 9

1. Doing math calculations in OpenSCAD
2. Creating any 2D object with the polygon primitive
3. Challenge
4. Creating more complex object using the polygon primitive and math
5. Another challenge

### Useful links

- [OpenSCAD's website](https://www.openscad.org/index.html)
- [Download OpenSCAD](https://www.openscad.org/downloads.html)
- [Syntax cheat sheet](https://www.openscad.org/cheatsheet/index.html)
- The OpenSCAD Language Manual for use later as a reference.

---

## Chapter 1

### A few words about OpenSCAD

OpenSCAD is for crafting 3D models through the art of Constructive Solid Geometry. It unlocks a world of creativity, where elementary operations are like our building blocks.

Let's shape up some fun.

### Getting started with the Tutorial

This tutorial will be your trusted guide. We'll be exploring examples and unveil the secrets of OpenSCAD. By the end of this tutorial, you will have the tools to forge your own unique 3D models, line by line.

With each step, you'll gain confidence and expertise, honing your skills as an image creator. You will breathe code into your designs, crafting intricate structures and bringing your design ideas to fruition.

Throughout this tutorial, we'll be your companion, offering guidance to unlock the full potential of OpenSCAD.

You'll explore, learn, and create.

### User Interface

After starting OpenSCAD the window should look similar to the image below.

The Window is divided in three columns.

1. In the left column, is the built-in text editor, where the true magic unfolds. As you enter keyboard commands you can view the transformation of code into art.
2. In the middle column, the displayed 3D View is where your design creations come to life. At the bottom lies the operations sequence console, always ready to lend a helping hand. It unravels the mysteries of mistakes and guides you towards mastery. It is your trusted guidance companion.
3. And note the right column, the GUI Customizer. It offers the user a gift of ease toolbar, a graphical interface to tweak and twist your model's parameters.

### Creating your first object

Your first object is going to be a perfect cube with side length of 10. In order to create it you need to type the following code in the text editor and hit the preview (first) icon on the action bar below the reference axes.

Code — `a_small_cube.scad`

```openscad
cube(10);
```

There are a few fundamental concepts that you should learn from the start regarding the OpenSCAD scripting language, especially if you don't have a programming background. The word 'cube' is part of OpenSCAD scripting language and is used to command OpenSCAD to create a cube. The 'cube' command is followed by a pair of parentheses, inside of which the parameter size is defined to be 10. Any definition of parameters that a command may require is always done inside a pair of matching parentheses that follow the command word. The semicolon after the last parenthesis indicates the end of that statement, and helps OpenSCAD parse the script that you typed in the text editor. Because a semicolon is used to indicate the end of each statement you have the freedom to format your code in any way you like by inserting whitespace.

> **Exercise**
> Try adding some whitespace between the word 'cube' and the first parenthesis and then hit (select) the "preview" option. Is your cube created? Do you get any error message? Try adding some additional whitespace in different places and hit "preview" again to see what you can get away with before getting an error message in the console. What happens if you add whitespace between the syllables 'cu' and 'be' of the word 'cube' and hit "preview"? What happens if you delete the semicolon?

You just read "hit preview" three times in the last paragraph. When you hit "preview" OpenSCAD parses your script and creates the appropriate model. Every time you make a change to your script (e.g. adding whitespace) or later, when adding additional statements, you need to hit "preview" to see the effect of these changes. In case you haven't found the "preview" icon yet, it is the dotted line cube with the two ">>" characters under it. It can also be selected by hitting the F5 key.

> **Exercise**
> Try changing the size of the cube to 20 and see what happens. Did you remember to hit preview in order to see your changes take place?

### Creating a slightly different cube

A cube doesn't have to be perfect (equal distance). A cube can have different side lengths. Use the following statement to create a cube (cubical) with side lengths of 25, 35 and 55.

Code — `a_different_cube.scad`

```openscad
cube([25,35,55]);
```

This cube is quite large compared to the previous one. In fact, it is so large it doesn't fit in the viewport. To fix that, hover your mouse over the viewport and scroll out until you can see the entire cube. Zoom in and out by hovering your mouse over the viewport and rotating the scroll wheel. Alternatively, you can use the zoom in (fourth) and out (fifth) icons on the action bar below the viewport. You can let OpenSCAD automatically choose a convenient zoom level by using the view all (third) icon in the same action bar.

> **Exercise**
> Try moving your mouse over the viewport and using the scroll wheel to zoom in and out. Try zooming in and out using the corresponding icons. Let OpenSCAD choose a zoom level for you.

Apart from zooming in and out, you can also move and rotate the view of your model. To do so, you need to hover your mouse over the viewport while holding down the right button to move or drag the object. Hold down the left button to rotate the object. Reset the view by clicking on the reset view (sixth) icon on the action bar below the viewport.

> **Exercise**
> Try dragging your mouse over the viewport while holding down the right or left button to move or rotate your model.

In order to create a cube with different side lengths, you need to define a pair of brackets with three values inside the parentheses. The pair of brackets is used to denote vector values. The values of the vector need to be comma separated, and correspond to the cube side lengths along the X, Y and Z axes. Previously, you used the cube command to create a perfect cube by defining the value of the size parameter. Most OpenSCAD commands can be used with different parameters, some with more, less or no parameters to achieve different results.

> **Exercise**
> Try using the cube command with no parameters. What happens? Use the cube command to create a cube with side lengths of 50, 5 and 10. Use the cube command to create a perfect cube with side length of 17.25.

You should notice that every cube is created on the first octant. You can define an additional parameter named center and set it equal to true, in order to draw the cube centered on the origin.

Here's an example of the complete statement:

Code — `a_centered_cube_with_different_side_lengths.scad`

```openscad
cube([20,30,50],center=true);
```

Notice that when more than one parameter is defined inside the parentheses, they need to be separated with a comma.

> **Exercise**
> Try creating a perfect cube or a cube with different side lengths. Use an appropriate additional input parameter to make this cube centered on the origin. If you like, add some whitespace before and after the comma that separates the two parameters.

### Adding more objects and translating objects

The constructive solid modelling approach uses a number of fundamental objects along with a number of ways to transform and combine these objects to create more complex models. The cube that you have been using in the previous examples is one such fundamental object. The fundamental objects are called primitives and are directly available in the OpenSCAD scripting language. A car for example, is not an OpenSCAD primitive, as there is no corresponding keyword in the scripting language. This makes absolute sense because OpenSCAD is a set of modelling tools rather than a library of predefined models. Using the available tools, you can combine the available primitives to create your own car. To do this, you need to know how to add more than one object to your model.

First create a cube with side lengths of 60, 20 and 10 that is centered on the origin.

Code

```openscad
cube([60,20,10],center=true);
```

In order to add a second cube to your model, type an identical statement in the next line of the text editor.

Change the side lengths to 30, 20 and 10.

Code — `a_smaller_cube_covered_by_a_bigger_cube.scad`

```openscad
cube([60,20,10],center=true);
cube([30,20,10],center=true);
```

You should not see any change in your model because the second cube is not larger than the first cube in any dimension, and is currently completely covered by the first cube. By modifying the second statement in the following way, you can translate the second cube to place it on top of the first cube.

Code — `two_cubes.scad`

```openscad
cube([60,20,10],center=true);
translate([0,0,5])
    cube([30,20,10],center=true);
```

You achieve this by using the "translate" command - one of the available transformations. The translate command, as well as the rest of the transformations don't create an object on their own. Rather, they are applied to existing objects to modify them. The translate command can be used to move an object to any point in space. The input parameter for the translate command is a vector of three values. Each value indicates the amount of units that the object will be moved along the X, Y and Z axes. Notice there is no semicolon after the translate command. What follows the translate command is the definition of the object that you wish to translate. The semicolon is added at the end to indicate the completion of the statement.

> **Exercise**
> Try changing the input parameter of the translate command, so the cube is translated 5 units along the X axis and 10 units along the Z axis. Try adding some whitespace if you would like to format this statement in a different way. Try adding a semicolon after the translate command.

Code — `two_cubes_barely_touching.scad`

```openscad
cube([60,20,10],center=true);
translate([0,0,10])
    cube([30,20,10],center=true);
```

In the example above, the second cube sits exactly on top of the first cube. This is something that should be avoided, as it's not clear to OpenSCAD whether the two cubes form one object together. This issue can be easily solved by always maintaining a small overlap of about 0.001 - 0.002 between the corresponding objects. One way to do so is by decreasing the amount of translation along the Z axis from 10 unit to 9.999 units.

Code — `two_cubes_with_small_overlap.scad`

```openscad
cube([60,20,10],center=true);
translate([0,0,9.999])
    cube([30,20,10],center=true);
```

Another way to do so more explicitly is by subtracting 0.001 units from the corresponding value on the script.

Code — `two_cubes_with_explicit_small_overlap.scad`

```openscad
cube([60,20,10],center=true);
translate([0,0,10 - 0.001])
    cube([30,20,10],center=true);
```

There is a third way. To avoid losing 0.001 from the top, we can add a third cube with the X-Y dimensions of the smaller cube, and height of 0.002 ([30, 20, 0.002]). The third cube will close the gap.

Code — `third_cube_close_small_gap.scad`

```openscad
cube([60,20,10],center=true);
translate([0,0,10])
    cube([30,20,10],center=true);
translate([0,0,5 - 0.001])
    cube([30,20,0.002],center=true);
```

You will encounter this throughout the tutorial. Instead of two objects just touching each other, always guarantee a small overlap by subtracting or adding a tolerance of 0.001 units.

### The cylinder primitive and rotating objects

The model that you just created looks like the body of a car that has bad aerodynamics. That's ok. You will be making the car look a lot more interesting and aerodynamic in the following chapters. For now, you are going to use the cylinder primitive and the rotate transformation to add wheels and axles to your car. You can create a wheel by adding a third statement that consists of the cylinder command. You will need to define two input parameters, h and r.

h is the height of the cylinder. r is its radius.

Code — `a_cylinder_covered_by_cubes.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
cylinder(h=3,r=8);
```

Notice the cylinder is hidden by the other objects. Use the translate command to make the cylinder visible by translating it 20 units along the negative direction of the Y axis.

Code — `two_cubes_and_a_cylinder.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
translate([0,-20,0])
    cylinder(h=3,r=8);
```

The wheel is now visible, but your car won't go anywhere if its not properly placed. You can use the rotate command to make the wheel stand up straight. To do so, you need to rotate it 90 degrees around the X axis.

Code — `two_cubes_and_a_rotated_cylinder.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
rotate([90,0,0])
    translate([0,-20,0])
    cylinder(h=3,r=8);
```

Notice the absence of a semicolon between the rotate and translate command. By now, you should be getting familiar with this concept. The semicolon is only added at the end of a statement. You can keep adding as many transformation commands as you like, but you should not include a semicolon between them.

The second thing to make note of is the rotate command has one input parameter, which is a vector of three values. Analogous to the translate command, each value indicates how many degrees an object will be rotated around the X, Y and Z axes.

The third thing to note is the wheel is standing straight but as a result of its rotation around the x axis it has moved below the car. This happened because the object was moved away from the origin before it was rotated. A good practice for placing objects inside your model is to rotate them first, then translate them to the desired position. Note that OpenSCAD generates the object, then applies the object transformations starting with the one immediately before the object definition, then working backwards. So in order to rotate your object, then move it with a translation, specify the translation first, followed by the rotation, followed by the object definition.

> **Exercise**
> Try first rotating the wheel and then translating it, by changing the order of the rotate and translate commands.

Code — `two_cubes_and_a_rotated_and_translated_cylinder.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
translate([0,-20,0])
    rotate([90,0,0])
    cylinder(h=3,r=8);
```

It already looks a lot better than the previous position of the wheel.

> **Exercise**
> Try modifying the input parameter of the translate command to make this wheel the front left wheel of your car.

Code — `car_body_and_front_left_wheel.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
translate([-20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8);
```

> **Exercise**
> Try adding the front right wheel of the car by duplicating the last statement and changing only the sign of one value.

Code — `car_body_and_misaligned_front_wheels.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
translate([-20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8);
translate([-20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8);
```

You should notice that the position of the wheels is not symmetric. This happened because the cylinder was not created centered on the origin.

> **Exercise**
> Try adding an additional input parameter to the cylinder commands to tell OpenSCAD both wheels should be centered on the origin when first created. Is the position of your wheels symmetric now?

Code — `car_body_and_aligned_front_wheels.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
translate([-20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([-20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
```

> **Exercise**
> Try using what you have learned to add the rear missing wheels to the car. Try adding a connecting axle to the front and rear wheels.

### Completing your first model

Code — `completed_car.scad`

```openscad
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
translate([-20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([-20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([-20,0,0])
    rotate([90,0,0])
    cylinder(h=30,r=2,center=true);
translate([20,0,0])
    rotate([90,0,0])
    cylinder(h=30,r=2,center=true);
```

Notice on the model above, there is an overlap between the axles and the wheels that is equal to half the thickness of the wheels. If the model was created in a way that the wheels and the axles were just touching each other, then there would be a need to ensure a small overlap between them as was done with the two cubes of the car's body.

One thing you may have noticed is the resolution of the wheels. Until now you have been using OpenSCAD's default resolution settings. There are special commands in OpenSCAD language which allow you to have full control over the resolution of your models. Increasing the resolution of your model will also increase the required rendering time every time you update your design. For this reason, it is advised that you keep the default resolution settings when you are building your model, and increase the resolution only after completing your design. Since the car example is completed, you can increase the resolution by adding the following two statements in your script.

Code

```openscad
$fa = 1;
$fs = 0.4;
```

Try adding the above two statements at the beginning of the car's script. Do you notice any changes in the resolution of the wheels?

Code — `completed_car_higher_resolution.scad`

```openscad
$fa = 1;
$fs = 0.4;
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
translate([-20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([-20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
translate([-20,0,0])
    rotate([90,0,0])
    cylinder(h=30,r=2,center=true);
translate([20,0,0])
    rotate([90,0,0])
    cylinder(h=30,r=2,center=true);
```

$fa and $fs are special variables that determine the resolution of the model according to the values that have been assigned to them. Their exact function will be explained later, and is something that you should not worry about yet. The only thing you need to keep in mind, is that you can add these two statements in any script to achieve a resolution that is universally good for 3D printing. These two statements will be used in all examples throughout the tutorial in order to have visually appealing renderings.

Before sharing your script with your friends, it would be nice to include some comments to help them understand your script. You can use a double slash at the start of a line to write anything you like without affecting your model. By using a double slash, OpenSCAD knows that what follows is not part of the scripting language and simply ignores it.

> **Exercise**
> Try adding a comment above each statement to let your friends know what part of your model is created with each statement.

**Solution**

Code — [Expand]

It's time to save your model. Hit the save (third) icon on the action bar above the editor to save your script as a \*.scad file. When you are creating a new model remember to save early, then save often, to avoid accidentally losing your work.

If you would like to 3D print your car you can export it as an STL file. First click on the render (second) icon on the action bar below the viewport to generate the STL file, then click on the export as STL icon on the action bar above the editor, to save an STL file of your model.

### Creating a second model

> **Exercise**
> Try using everything you learned to create a new simple model. It can be a house, an airplane or anything you like. Don't worry about making your model look perfect, just experiment with your new skills! You will keep learning more techniques to create awesome models in the following chapters.

---

## Chapter 2

### Scaling parts or the whole model

The model you created in the previous chapter was a great starting point for working with OpenSCAD, but perhaps after seeing it you recognized some aspects which should be changed. Here we will discuss strategies for modifying components of designs. One way to do so is by using the scale command, which is another one of the transformation commands. Modify the statement that creates the base of the car's body in the following way in order to increase the length of the body by a ratio of 1.2.

Code — `car_with_lengthened_body_base.scad`

```openscad
…
// Car body base
scale([1.2,1,1])
    cube([60,20,10],center=true);
…
```

You should notice that the scale command is used like the transform and rotate commands. It is added to the left of an existing statement without including a semicolon in between and it has a vector of three values as an input parameter. In analogy to the translate and rotate commands each value corresponds to the scaling ratio along the X, Y and Z axis.

> **Exercise**
> Try modifying the input of the scale command in order to scale the base of the body by a factor of 1.2 along the X axis and a factor of 0.1 or 2 along the Y axis. Did you get anything that could be a Mars rover or a tank? Are you surprised with how different the models look compared to the original car?

It is also possible to apply the same scale command or any other transformation command to more than one objects. Use the following code to apply the scale command to both the base and the top of the car's body.

Code — `car_with_lengthened_body.scad`

```openscad
scale([1.2,1,1]) {
    // Car body base
    cube([60,20,10],center=true);
    // Car body top
    translate([5,0,10 - 0.001])
        cube([30,20,10],center=true);
}
```

The first thing you should notice is that in order to apply the scale command to more than one object, a set of curly brackets is used. The statements that define the corresponding objects along with their semicolons are placed inside the curly brackets. The curly brackets don't require a semicolon at the end.

The second thing you should notice is how the use of white space and comments increase the readability of your script. The following script is exactly equivalent, you can decide for yourself which one you'd rather have to read.

Code

```openscad
scale([1.2,1,1]) {
cube([60,20,10],center=true);
translate([5,0,10 - 0.001])
cube([30,20,10],center=true);
}
```

> **Exercise**
> Try applying the scale command to your whole model. Did you remember to include all statements inside the curly brackets? What should be the relation between the scaling factors along the X and Z axis so that the wheels don't deform? What should the scaling factors be to get a car that has the same proportions but double the size?

For the wheels not to deform, the scaling factors along the X and Z axis should be equal.

Code — [Expand]

### Quick quiz

The following script is the model you created in the first chapter.

Code

```openscad
$fa = 1;
$fs = 0.4;
// Car body base
cube([60,20,10],center=true);
// Car body top
translate([5,0,10 - 0.001])
    cube([30,20,10],center=true);
// Front left wheel
translate([-20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
// Front right wheel
translate([-20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
// Rear left wheel
translate([20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
// Rear right wheel
translate([20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=8,center=true);
// Front axle
translate([-20,0,0])
    rotate([90,0,0])
    cylinder(h=30,r=2,center=true);
// Rear axle
translate([20,0,0])
    rotate([90,0,0])
    cylinder(h=30,r=2,center=true);
```

> **Exercise**
> Try rotating the front wheels by 20 degrees around the Z axis, as if the car was making a right turn. In order to make your model more convincing, try rotating the body of the car (base and top) by 5 degrees around the X axis in the opposite direction of the turn. To turn the wheels, modify the input parameters of existing rotate commands, to turn the body add a new rotate command.

Code — [Expand]

### Parameterizing parts of your model

You should have gotten the point that a model is most of the times not intended to exist in one version. One of the powers of OpenSCAD scripting language lies in making easy the ability to reuse models over and over again or simply to play around with them until you are satisfied to commit to a final version. It's time to make some modifications to your car!

> **Exercise**
> Try changing the radius of the wheels to 10 units. How easily did you find which values to modify? Did you have to do the same thing four times?

Code — [Expand]

Although it wasn't that hard to change the size of wheels it could have been much simpler. First, it could have been easier to find which values to change. Second, you could have only one value to change since all wheels have the same radius. All this can be achieved with the use of variables. In the following script a variable for the radius of the wheels is introduced.

Code

```openscad
wheel_radius = 8;
// Front left wheel
translate([-20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
// Front right wheel
translate([-20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
// Rear left wheel
translate([20,-15,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
// Rear right wheel
translate([20,15,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
```

Every variable has two parts: a name and a value. In this example, the variable name is "wheel_radius". A valid variable name uses only alphanumeric characters and underscores (A-Z, a-z, 0-9, and _). After the variable name, an equals sign separates the name from the value, and is followed by the value itself. Finally, a semicolon is required at the end to denote the completion of that statement. It's a good practice to keep your variables organized by defining them all at the top of the document.

Once a variable is defined, it can be used in the code to represent its value. In this example, the cylinder commands have been modified to use the wheel_radius variable for the input parameter r. When OpenSCAD evaluates this script, it will set the input parameter r equal to the value of the wheel_radius variable.

> **Exercise**
> Try using a variable named wheel_radius to define the size of your car's wheels. Try changing the size of the wheels a few times by modifying the value of the wheel_radius variable. How much easier did you find changing the size of the wheels using the wheel_radius variable?

Code — [Expand]

There is one important thing you should keep in mind about the behavior of variables in OpenSCAD. The variables in OpenSCAD behave like constants. They can hold only one value which they keep throughout the creation of your model. So, what happens if you assign a value to wheel_radius at the start of your script and then assign a new value to it after the definition of the two front wheels? Will the rear wheels have different size compared to the front wheels?

> **Exercise**
> Try assigning a different value to the wheel_radius variable right after the definition of the front wheels. Does your car have different front and rear wheel size?

Code — [Expand]

You should notice that all wheels have the same size. If multiple assignments to a variable exist, OpenSCAD uses the value of the last assignment. Even statements that make use of this variable and are defined before the last value assignment, will use the value of the last assignment. OpenSCAD will also give a warning in this case: WARNING: wheel_radius was assigned on line 3 but was overwritten on line 17

> **Note**
> A variable assignment within { curly braces } only applies within those braces. Duplicate assignments at different levels of brace enclosure are not considered to conflict.

### Parameterizing more parts of your model

You can now easily play around with the size of the wheels. It would be nice if you were able to customize more aspects of your model with such ease. You should notice for a moment that modifying the size of the wheels doesn't affect any other aspect of your model, it doesn't break your model in any way. This is not always the case.

> **Exercise**
> Try modifying the height of the car's body base and top by defining a base_height and a top_height variable and making the appropriate changes to the corresponding statements that define the base and the top. Assign the value 5 to the base_height variable and the value 8 to the top_height variable. What do you notice?

Code — [Expand]

It is obvious that the body of the car stops being one as the base and the top separate. This happened because the correct position of the body's top is dependent on the height of the body's base and the height of body's top. Remember that in order to make the top sit on top of the base you had to translate the top along the Z axis by an amount equal to half the height of the base plus half the height of the top. If you want to parameterize the height of the base and the top you should also parameterize the translation of the top along the Z axis.

> **Exercise**
> Try parameterizing the translation of the body's top along the Z axis using the base_height and top_height variables to make it sit on top of the body's base. Try assigning different values to the base_height and top_height variables. Does the position of the body's top remain correct?

Code — [Expand]

Code — [Expand]

You should remember that every time you parameterize some aspect of your model you should also parameterize additional dependent aspects to prevent your model from breaking apart.

> **Exercise**
> Try parameterizing the track (separation between left and right wheels) using a new variable named track. Try assigning different values to the track variable. What do you notice? Does any other aspect of your model depend on the value of the track variable? If yes, use the track variable to parameterize it so your model doesn't break apart.

Code — [Expand]

Code — [Expand]

### Challenge

The following script corresponds to the car model with parameterized wheel radius, base height, top height and track.

Code — `car_from_parameterized_script.scad`

```openscad
$fa = 1;
$fs = 0.4;
wheel_radius = 8;
base_height = 10;
top_height = 10;
track = 30;
// Car body base
cube([60,20,base_height],center=true);
// Car body top
translate([5,0,base_height/2+top_height/2 - 0.001])
    cube([30,20,top_height],center=true);
// Front left wheel
translate([-20,-track/2,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
// Front right wheel
translate([-20,track/2,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
// Rear left wheel
translate([20,-track/2,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
// Rear right wheel
translate([20,track/2,0])
    rotate([90,0,0])
    cylinder(h=3,r=wheel_radius,center=true);
// Front axle
translate([-20,0,0])
    rotate([90,0,0])
    cylinder(h=track,r=2,center=true);
// Rear axle
translate([20,0,0])
    rotate([90,0,0])
    cylinder(h=track,r=2,center=true);
```

> **Exercise**
> Try using a wheel_width variable to parameterize the width of the wheels, a wheels_turn variable to parameterize the rotation of the front wheels around the Z axis and a body_roll variable to parameterize the rotation of the body around the X axis. Experiment with assigning different values to wheel_radius, base_height, top_height, track, wheel_width, wheels_turn and body_roll to create a version of the car that you like.

Code — [Expand]

### Parameterizing your own models

By now it should be clear to you that parameterizing your models unlocks the power of reusing, customizing and iterating your designs as well as that of effortlessly exploring different possibilities.

Have you put your new skills into use? Have you created any other models yourself?

> **Exercise**
> Try parameterizing a few aspects or more of the models that you have created. See how far you can go! Experiment with assigning various combinations of values to the variables that you have defined. See how different the versions of your designs can be.

---

## Chapter 3

### The sphere primitive and resizing objects

You showed the car to your friends and they were quite impressed with your new skills. One of them even challenged you to come up with different futuristic wheel designs. It's time to put your creativity to work and learn more OpenSCAD features!

So far you have been using the cube and cylinder primitives. Another 3D primitive that is available in OpenSCAD is the sphere. You can create a sphere using the following command.

Code — `sphere.scad`

```openscad
sphere(r=10);
```

You should notice that the sphere is created centered on the origin. The input parameter r corresponds to the radius of the sphere.

One idea that came to your head was to replace the cylindrical wheels with spherical ones.

> **Exercise**
> Try making the wheels of your car spherical. To do so replace the appropriate cylinder commands with sphere commands. Is there still a need to rotate the wheels around the X axis? Is the wheel_width variable still required? Is there any visible change to your model when you modify the value of wheels_turn variable?

Code — [Expand]

The idea to use a sphere to create the wheels was nice. You can now squish the spheres to give them a more wheel like shape. One way to do so is using the scale command.

> **Exercise**
> Try creating a sphere with a radius of 10 units on a blank model. Use the scale command to scale the sphere by a factor of 0.4 only along the Y axis.

Code — [Expand]

Another way to scale objects is by using the resize transformation. The difference between scale and resize is that when using the scale command, you have to specify the desired scaling factor along each axis but when using the resize command you have to specify the desired resulting dimensions of the object along each axis. In the previous example you started with a sphere that has a radius of 10 units (total dimension of 20 units along each axis) and scaled it by a factor of 0.4 along the Y axis. Thus, the resulting dimension of the scaled sphere along the Y axis is 8 units. The dimensions along the X and Z axis remain the same (20 units) since the scaling factors along these axes are equal to 1. You could achieve the same result using the following resize command.

Code — `narrowed_spherical_wheel_using_resize.scad`

```openscad
resize([20,8,20])
    sphere(r=10);
```

When you are scaling/resizing an object and you are concerned about its resulting dimensions it is more convenient to use the resize command. In contrast when you are concerned more about the ratio of the resulting dimensions compared to the starting dimensions it is more convenient to use the scale command.

> **Exercise**
> Try squishing the spherical wheels of your car along the Y axis. Use the resize command and the wheel_width variable to have control over the resulting width of the wheels. Resize the wheels only along the Y axis.

Code — [Expand]

The new wheel design looks cool. You can now create a body that better suits this new style.

> **Exercise**
> Try using the sphere and resize/scale commands in place of the cube commands to create a body that matches the style of the wheels.

Code — [Expand]

### Combining objects in other ways

So far when you wanted to create an additional object in your model, you just added another statement in your script. The final car model is the union of all objects that have been defined in your script. You have been implicitly using the union command which is one of the available boolean operations. When using the union boolean operation, OpenSCAD takes the union of all objects as the resulting model. In the following script the union is used implicitly.

Code — `union_of_two_spheres_implicit.scad`

```openscad
sphere(r=10);
translate([10,0,0])
    sphere(r=10);
```

You can make the use of union explicit by including the union command in your script.

Code — `union_of_two_spheres_explicit.scad`

```openscad
union() {
    sphere(r=10);
    translate([12,0,0])
        sphere(r=10);
}
```

You should notice that the union command doesn't have any input parameters. This is true for all boolean operations. The union is applied to all objects inside the curly brackets. You should also notice that the statements inside the curly brackets have a semicolon at the end. In contrast there is no semicolon after the closing curly bracket. This syntax is similar to the use of transformations when applied to multiple objects.

In total there are three boolean operations. The second one is the difference. The difference command subtracts the second and all further objects that have been defined inside the curly brackets from the first one. The previous example results in the following model when using the difference operation instead of the union.

Code — `difference_of_two_spheres.scad`

```openscad
difference() {
    sphere(r=10);
    translate([12,0,0])
        sphere(r=10);
}
```

Further defined objects (third, fourth etc.) are also subtracted. The following example has three objects.

Code — `difference_of_three_spheres.scad`

```openscad
difference() {
    sphere(r=10);
    translate([12,0,0])
        sphere(r=10);
    translate([0,-12,0])
        sphere(r=10);
}
```

The third boolean operation is the intersection. The intersection operation keeps only the overlapping portion of all objects. The previous example results in the following model when the intersection operation is used.

Code — `intersection_of_three_spheres.scad`

```openscad
intersection() {
    sphere(r=10);
    translate([12,0,0])
        sphere(r=10);
    translate([0,-12,0])
        sphere(r=10);
}
```

The resulting model is the common area of all three objects.

When only the first two spheres are defined inside the curly brackets, the intersection is the following.

Code — `intersection_of_two_spheres.scad`

```openscad
intersection() {
    sphere(r=10);
    translate([12,0,0])
        sphere(r=10);
}
```

> **Exercise**
> Try using the difference operation to create a new wheel design. To do so first create a sphere and then subtract a portion of a sphere from both sides. The radius of the first sphere should be equal to the desired wheel radius (wheel_radius variable). The radius of the other two spheres should be equal to a side_spheres_radius variable. Given a hub_thickness variable what is the amount of units that the side spheres should be translated along the positive and negative direction of Y axis so that the thickness of the remaining material at the center of the first sphere is equal to the value of hub_thickness?

Code — [Expand]

> **Exercise**
> Try removing some material from the wheels by subtracting four cylinders that are perpendicular to the wheel. The cylinders should be placed at half the wheel radius and be equally spaced. Introduce a cylinder_radius and a cylinder_height variable. The value of cylinder_height should be appropriate so that the cylinders are always longer than the thickness of the material they are removed from.

Code — [Expand]

> **Exercise**
> Try using the above wheels in one version of the car.

Code — [Expand]


---

# OpenSCAD Tutorial/Chapter 4

The script of the last example of the previous chapter got quite long. This was the result of replacing the simple cylindrical wheels (which required one statement to be created) with a more complex wheel design (which requires many statements to be created). To change the wheels from the simple to the complex design you have to identify all cylinder commands that define the simple wheels and replace them with commands that define the complex wheels. This process sounds similar to the steps you had to go through to change the diameter of the wheels. When no use of variables was made you had to identify the corresponding values in your script and replace them one by one with the new value. This repetitive and time-consuming process was improved with the use of a wheel_radius variable which enabled you to quickly and easily change the diameter of the wheel. Can you do anything to improve the corresponding error-prone process when you want to completely change the design of the wheels? The answer is yes! You can use modules which is the analogue of variables applied to whole parts/models. You can define a part of your design or even your whole model as a module.

First remember for a moment the design of the complex wheel.

## Defining and using modules

**Code** — `wheel_with_spherical_sides_and_holes.scad`

```openscad
$fa = 1;
$fs = 0.4;
wheel_radius=10;
side_spheres_radius=50;
hub_thickness=4;
cylinder_radius=2;
cylinder_height=2*wheel_radius;
difference() {
    // Wheel sphere
    sphere(r=wheel_radius);
    // Side sphere 1
    translate([0,side_spheres_radius + hub_thickness/2,0])
        sphere(r=side_spheres_radius);
    // Side sphere 2
    translate([0,- (side_spheres_radius + hub_thickness/2),0])
        sphere(r=side_spheres_radius);
    // Cylinder 1
    translate([wheel_radius/2,0,0])
        rotate([90,0,0])
            cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    // Cylinder 2
    translate([0,0,wheel_radius/2])
        rotate([90,0,0])
            cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    // Cylinder 3
    translate([-wheel_radius/2,0,0])
        rotate([90,0,0])
            cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    // Cylinder 4
    translate([0,0,-wheel_radius/2])
        rotate([90,0,0])
            cylinder(h=cylinder_height,r=cylinder_radius,center=true);
}
```

You can define the above wheel as a module in the following way.

**Code** — `blank_model.scad`

```openscad
$fa = 1;
$fs = 0.4;
module wheel() {
    wheel_radius=10;
    side_spheres_radius=50;
    hub_thickness=4;
    cylinder_radius=2;
    cylinder_height=2*wheel_radius;
    difference() {
        // Wheel sphere
        sphere(r=wheel_radius);
        // Side sphere 1
        translate([0,side_spheres_radius + hub_thickness/2,0])
            sphere(r=side_spheres_radius);
        // Side sphere 2
        translate([0,- (side_spheres_radius + hub_thickness/2),0])
            sphere(r=side_spheres_radius);
        // Cylinder 1
        translate([wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 2
        translate([0,0,wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 3
        translate([-wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 4
        translate([0,0,-wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    }
}
```

There are a few things that you need to get right. The first thing you should notice is that in order to define a module you have to type the word module followed by a name which you want to give to this module. In this case the module is named wheel. After the name of the module follows a pair of parentheses. Currently there is nothing inside the parentheses because no parameters have been defined for this module. Finally, after the pair of parentheses follows a pair of curly brackets. All commands that defined the corresponding object are placed inside the curly brackets. A semicolon is not required at the end.

The second thing you should notice is that OpenSCAD has not created any wheel. This is because you have just defined the wheel module but have not used it yet. In order to create a wheel you need to add a statement that creates a wheel, similar to how you would add a statement to create any primitive object (cube, sphere etc.).

**Code** — `wheel_created_by_module.scad`

```openscad
$fa = 1;
$fs = 0.4;
module wheel() {
    wheel_radius=10;
    side_spheres_radius=50;
    hub_thickness=4;
    cylinder_radius=2;
    cylinder_height=2*wheel_radius;
    difference() {
        // Wheel sphere
        sphere(r=wheel_radius);
        // Side sphere 1
        translate([0,side_spheres_radius + hub_thickness/2,0])
            sphere(r=side_spheres_radius);
        // Side sphere 2
        translate([0,- (side_spheres_radius + hub_thickness/2),0])
            sphere(r=side_spheres_radius);
        // Cylinder 1
        translate([wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 2
        translate([0,0,wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 3
        translate([-wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 4
        translate([0,0,-wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    }
}
wheel();
```

You can think of defining modules as extending the OpenSCAD scripting language. When you have defined a wheel module it's like having an additional available primitive object. In this case the new object is the wheel that you have defined. You can then use this module similar to how you would use any other available primitive.

> **Exercise**
> Try defining the above wheel module in the car's script. Try creating the wheels of the car using the defined wheel module.

**Code** — \[Expand\]

The wheel design that was specified in the wheel module has a number of variables that can be used to customize it. These variables are defined inside the curly brackets of the wheel module's definition. As a result, while the output of the wheel module can be customized, the wheel module itself can create only one version of the wheel which corresponds to the values of the defined variables. This means the wheel module can't be used to create different wheels for the front and back axles. If you have been getting a feeling of the good practices of parametric design, you should realize that such a thing is not desired. It would be way better if the wheel module could be used to create different versions of the wheel. For this to happen the variables that are defined and used inside the wheel module, need to be defined as parameters of the wheel module instead. This can be done in the following way.

## Parameterizing modules

**Code** — `wheel_created_by_parameterized_module.scad`

```openscad
$fa = 1;
$fs = 0.4;
module wheel(wheel_radius, side_spheres_radius, hub_thickness, cylinder_radius) {
    cylinder_height=2*wheel_radius;
    difference() {
        // Wheel sphere
        sphere(r=wheel_radius);
        // Side sphere 1
        translate([0,side_spheres_radius + hub_thickness/2,0])
            sphere(r=side_spheres_radius);
        // Side sphere 2
        translate([0,- (side_spheres_radius + hub_thickness/2),0])
            sphere(r=side_spheres_radius);
        // Cylinder 1
        translate([wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 2
        translate([0,0,wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 3
        translate([-wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 4
        translate([0,0,-wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    }
}
wheel(wheel_radius=10, side_spheres_radius=50, hub_thickness=4, cylinder_radius=2);
```

You should notice the definition of the module's parameters inside the parentheses. You should also notice that the value of each parameter is no longer assigned inside the curly brackets of the module's definitions. Instead, the value of the parameters is defined every time the modules is called. As a result, the module can now be used to create different versions of the wheel.

> **Exercise**
> Try defining the above wheel module in the car's script. Try creating the car's wheels by using the wheel module. When calling the wheel module pass the values of 10, 50, 4 and 2 to the corresponding wheel_radius, side_spheres_radius, hub_thickness and cylinder_radius parameters.

**Code** — \[Expand\]

> **Exercise**
> Try defining a wheel_radius, side_spheres_radius, hub_thickness and cylinder_radius variable in the car's script and assign the values of 10, 50, 4 and 2 accordingly. Try using these variables to define the values of the wheel_radius, side_spheres_radius, hub_thickness and cylinder_radius parameters when calling the wheel module.

**Code** — \[Expand\]

> **Exercise**
> Try defining different wheel_radius, side_spheres_radius, hub_thickness and cylinder_radius variables for the front and rear axles. Try assigning a combination of values that you like to these variables. Remember to also edit the name of the variables in the respective calls of the wheel module.

**Code** — \[Expand\]

You can set a specific combination of values for the wheel module's parameters as default. This can be achieved in the following way.

## Defining default values of module's parameters

**Code**

```openscad
$fa = 1;
$fs = 0.4;
module wheel(wheel_radius=10, side_spheres_radius=50, hub_thickness=4, cylinder_radius=2) {
    cylinder_height=2*wheel_radius;
    difference() {
        // Wheel sphere
        sphere(r=wheel_radius);
        // Side sphere 1
        translate([0,side_spheres_radius + hub_thickness/2,0])
            sphere(r=side_spheres_radius);
        // Side sphere 2
        translate([0,- (side_spheres_radius + hub_thickness/2),0])
            sphere(r=side_spheres_radius);
        // Cylinder 1
        translate([wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 2
        translate([0,0,wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 3
        translate([-wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 4
        translate([0,0,-wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    }
}
```

You should notice that the default values are assigned inside the parentheses at the definition of the module. By defining default values for the module's parameters, you have more flexibility in the way the wheel module is used. For example, the simplest way to use the module is without specifying any parameters when calling it.

**Code** — `wheel_created_by_default_parameters.scad`

```openscad
…
wheel();
…
```

If a parameter's value is not specified when calling the wheel module, the default value for this parameter is used. The default values can be set equal to the most used version of the wheel. The default values can be overridden by assigning a new value to the corresponding parameters when calling the wheel module. None or any number of default values may be overridden. Thus, by specifying default values the wheel module can be used in any of the following ways as well as in many more.

**Code** — `wheel_created_by_default_parameters.scad`

```openscad
…
wheel();
…
```

**Code** — `wheel_with_thicker_hub.scad`

```openscad
…
wheel(hub_thickness=8);
…
```

**Code** — `wheel_with_thicker_hub_and_larger_radius.scad`

```openscad
…
wheel(hub_thickness=8, wheel_radius=12);
…
```

> **Exercise**
> Include default values in the definition of the wheel module. Try creating a few wheels by overriding any number of default values. Can you make a wheel that looks like the following?

**Code** — \[Expand\]

The use of modules is a very powerful feature of OpenSCAD. You should start thinking of your models as a combination of modules. For example, the car model can be thought of as a combination of a body, wheel and axle module. This opens the possibilities of further reusing and recombining your modules to create different models.

> **Exercise**
> Try defining a body and an axle module. What parameters should the body and axle modules have? Try recreating the car using the body, wheel and axle modules. Give the parameters of the wheel module a default set of values that corresponds to the front wheels. Pass different values to the wheel module when creating the rear wheels by defining appropriate variables in your script. Set default values for the parameters of the body and axle modules too.

**Code** — \[Expand\]

## Separating the whole model into modules

> **Exercise**
> Try reusing the body, wheel and axle modules to create vehicle that looks similar to the following.

**Code** — \[Expand\]

---

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_Tutorial/Chapter_4&oldid=4613485"

---

# OpenSCAD Tutorial/Chapter 5

In the previous chapter you learned one of the most powerful features of OpenSCAD, the module, and how it can be used for parametric design. You also had the chance to separate the car into different modules and then recombine them to create a different type of vehicle. Using modules can be also seen as a way to organize your creations and to build your own library of objects. The wheel module could potentially be used in a plethora of designs, so it would be great to have it easily available whenever desired without having to redefine it inside the script of your current design. To do so you need to define and save the wheel module as a separate script.

> **Exercise**
> Define the following simple_wheel module in a separate script file. In the same script make a call to the simple_wheel module so that you visually see what object this module creates. Save the script file as a scad file named simple_wheel.scad.

**Code** — `simple_wheel.scad`

```openscad
$fa = 1;
$fs = 0.4;
module simple_wheel(wheel_radius=10, wheel_width=6) {
    rotate([90,0,0])
        cylinder(h=wheel_width,r=wheel_radius,center=true);
}
simple_wheel();
```

## Creating and utilizing modules as separate scripts

Now it's time to utilize this saved module in another design. First you need to create a new design.

> **Exercise**
> Create a new script with the following car design. Give the script any name you like but save the script in the same working directory as the simple_wheel module.

**Code** — \[Expand\]

There are two ways in which the simple_wheel.scad script can be utilized in your car design. It can be either included or used. To include the script, you have to add the following statement at the top of car's script.

**Code**

```openscad
include <simple_wheel.scad>
```

You should notice that something unexpected happened. A wheel has been created at the origin. This is the object of the simple_wheel script. When you use include, OpenSCAD treats the whole external script that you are including as if it was a part of your current script. In the simple_wheel.scad script, aside from the simple_wheel module definition, there is also a call to the simple_wheel module which creates a wheel object. As a result of using the include command this object is also created in the car's model. This is something that you are going to change by using the use instead of the include command, but don't bother about it for a moment.

> **Exercise**
> The car's wheels are currently created with the cylinder command. Since the simple_wheel.scad script has been included in the car's script, the simple_wheel module should be available. Replace the cylinder commands with calls to the simple_wheel module. Do any rotate commands become unnecessary? The calls to the simple_wheel module shall not contain any definition of parameters.

**Code** — \[Expand\]

> **Exercise**
> Define the wheel_radius and wheel_width parameters in the calls to the simple_wheel module. To do so use the existing wheel_radius variable as well as a wheel_width variable that you are going to define. Set the variables equal to values that you like.

**Code** — \[Expand\]

From the above examples you should keep in mind that when you include an external script in your current script, the modules of the external script become available in your current script, but additionally any objects that were created in the external script are also created in the current one. Since the wheel at the origin is not desired in this case, it's time to use the use command instead of the include.

> **Exercise**
> Replace the include command of the last example with a use command.

**Code** — \[Expand\]

You should notice that a wheel is no longer created at the origin. You should keep in mind that the use command works like the include command with the only difference being that the use command doesn't create any objects, but rather just makes the modules of the external script available in the current script.

In the previous example, the simple_wheel.scad script had only one module. The simple_wheel module. This doesn't have to always be the case.

> **Exercise**
> Add the following module in the simple_wheel.scad script. Rename the simple_wheel.scad script to wheels.scad.

## Using a script with multiple modules

**Code**

```openscad
module complex_wheel(wheel_radius=10, side_spheres_radius=50, hub_thickness=4, cylinder_radius=2) {
    cylinder_height=2*wheel_radius;
    difference() {
        // Wheel sphere
        sphere(r=wheel_radius);
        // Side sphere 1
        translate([0,side_spheres_radius + hub_thickness/2,0])
            sphere(r=side_spheres_radius);
        // Side sphere 2
        translate([0,- (side_spheres_radius + hub_thickness/2),0])
            sphere(r=side_spheres_radius);
        // Cylinder 1
        translate([wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 2
        translate([0,0,wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 3
        translate([-wheel_radius/2,0,0])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
        // Cylinder 4
        translate([0,0,-wheel_radius/2])
            rotate([90,0,0])
                cylinder(h=cylinder_height,r=cylinder_radius,center=true);
    }
}
```

> **Exercise**
> Use the wheels.scad script in your car script. Use the simple_wheel module to create the front wheels and the complex_wheel module to create the rear wheels.

**Code** — \[Expand\]

With this example it should be clear that the name of the script doesn't have to be the same as the name of the module as well as that a script can contain multiple modules. There is no right or wrong way on how you should go about organizing your library of modules. In the last example a wheels.scad script which defines the different wheel modules was used. Alternatively you could have saved each module as a separate \*.scad script.

> **Exercise**
> Create a vehicle_parts.scad script. Inside this script define a simple_wheel, complex_wheel, body and axle module. Use this script in another script named vehicle_concept to make the corresponding modules available. Use the modules to create a vehicle concept that looks similar to the following.

**Code** — \[Expand\]

## Using the MCAD library

The MCAD library (https://github.com/openscad/MCAD) is a library of components commonly used in mechanical designs that comes with OpenSCAD. You can utilize objects of the MCAD library by using the corresponding OpenSCAD script and calling the desired modules. For example, there is a boxes.scad script which contains the model of a rounded box. The boxes.scad script contains one module, which can be used to create the corresponding box. You can open this script to check what the parameters of this module are and then use it to add rounded boxes in your design. You can create a fully rounded box with side lengths of 10, 20 and 30 units as well as fillet radius of 3 units using the following script.

**Code** — `completely_rounded_box.scad`

```openscad
use <MCAD/boxes.scad>
$fa=1;
$fs=0.4;
roundedBox(size=[10,20,30],radius=3,sidesonly=false);
```

By setting the sidesonly parameter equal to true you can create a box of similar dimension that has only 4 rounded sides.

**Code** — `sides_only_rounded_box.scad`

```openscad
use <MCAD/boxes.scad>
$fa=1;
$fs=0.4;
roundedBox(size=[10,20,30],radius=3,sidesonly=true);
```

The boxes.scad script is located in the MCAD directory which is under the libraries directory. The latter can be found in OpenSCAD's installation folder. Should you wish to have any of your own libraries accessible from any directory, you can add it in the libraries directory. You can also browse other available OpenSCAD libraries at https://www.openscad.org/libraries.html. Though, you should be aware that there are a very wide number of libraries available on GitHub and Thingiverse that far exceed those linked at OpenSCAD's libraries page.

> **Exercise**
> Use the boxes.scad script of the MCAD library to create a fully rounded box with side lengths of 50, 20 and 15 units as well as fillet radius of 5 units.

**Code** — \[Expand\]

> **Exercise**
> Use the boxes.scad script of the MCAD library to create a rounded box with only 4 rounded sides with side lengths of 50, 50 and 15 units as well as fillet radius of 20 units.

**Code** — \[Expand\]

## Creating even more parameterizable modules

So far, the only input to the modules that have been created was through the module's input parameters that were defined for each case. The complex_wheel module for example was able to create a plethora of parameterized wheels according to the chosen input parameters such as wheel_radius, hub_thickness etc.

In your vehicle designs you have been using body, wheel and axle modules which when combined can produce various types of vehicles. In all the vehicle designs, two wheels along with an axle have been used together to form a set of wheels. You may have considered the need for an axle_wheelset module to simultaneously define all three objects with a single statement. And you would have been right to consider it! But there is a reason this module hasn't been created yet, and you are now going to find out why.

Throughout the previous chapters you have created two different wheel designs (simple_wheel and complex_wheel) and a single axle design. You can use your existing knowledge to combine the simple_wheel and axle modules in the following way.

**Code** — `axle_with_simple_wheelset_from_module.scad`

```openscad
use <vehicle_parts.scad>
$fa = 1;
$fs = 0.4;
module axle_wheelset(wheel_radius=10, wheel_width=6, track=35, radius=2) {
    translate([0,track/2,0])
        simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
    axle(track=track, radius=radius);
    translate([0,-track/2,0])
        simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
}
axle_wheelset();
```

If you simply wanted to only use the above set of simple_wheels, that approach would be just fine. The problem though is that this axle_wheelset module is not really flexible and parameterizable to the desired degree. On one hand you can customize all input parameters, but on the other hand, could you swap the simple_wheel design with the complex one? The fact is that with the above approach in order to do so you would have to define a completely new module.

**Code** — `axle_with_complex_wheelset_from_module.scad`

```openscad
use <vehicle_parts.scad>
$fa = 1;
$fs = 0.4;
module axle_wheelset_complex(wheel_radius=10, side_spheres_radius=50, hub_thickness=4, cylinder_radius=2, track=35, radius=2) {
    translate([0,track/2,0])
        complex_wheel(wheel_radius=10, side_spheres_radius=50, hub_thickness=4, cylinder_radius=2);
    axle(track=track, radius=radius);
    translate([0,-track/2,0])
        complex_wheel(wheel_radius=10, side_spheres_radius=50, hub_thickness=4, cylinder_radius=2);
}
axle_wheelset_complex();
```

If you can't see yet how this is a problem, imagine the case where you had six different wheel designs and two different axle designs in your library. If you wanted to implement the axle_wheelset module you would need to define 12 different modules to cover all combinations of wheel and axle designs. Furthermore, if you were to add a new wheel or axle design in your collection, you would need to define a number of additional axle_wheelset modules which would make maintaining your library very hard.

The good thing is that the two modules above look very similar. If you could keep the structure of the module the same but have the specific choice of wheel design parameterized, then the problem could be solved. Fortunately, OpenSCAD supports this functionality and parameterizing the specific choice of wheel design can be achieved in the following way.

**Code** — `axle_with_simple_wheelset_from_parameterized_module.scad`

```openscad
use <vehicle_parts.scad>
$fa = 1;
$fs = 0.4;
module axle_wheelset(track=35, radius=2) {
    translate([0,track/2,0])
        children(0);
    axle(track=track, radius=radius);
    translate([0,-track/2,0])
        children(0);
}
axle_wheelset() {
    simple_wheel();
}
```

The wheel design can now be effortlessly changed, making this module a truly parametric one.

**Code** — `axle_with_complex_wheelset_from_parameterized_module.scad`

```openscad
axle_wheelset() {
    complex_wheel();
}
```

**Code** — `axle_with_large_complex_wheelset_from_parameterized_module.scad`

```openscad
axle_wheelset(radius=5) {
    complex_wheel(wheel_radius=20);
}
```

There is a very important concept that you should grasp here. The first thing you should notice is the definition of this new module. This new module is similar to the previous ones with the difference that the command children(0) is used in place of a call to a specific wheel module. The second thing you should notice is the call to the axle_wheelset module. The call to the axle_wheelset module contains a pair of curly brackets inside of which the specific wheel design to be used by module is defined each time. OpenSCAD keeps an ordered list of the objects that have been defined inside the curly brackets and numbers them starting from zero. These objects can then be referenced by the children command. The number that is passed inside the children command corresponds to the first, second, third etc. object that was defined inside the curly brackets, counting from zero. In the above example, only one object is defined inside the curly brackets. That is either a simple_wheel or a complex wheel object. This object is created every time the children(0) command is used. The children command is in essence a way to pass objects as input to a module.

The next examples can help make this concept more concrete. In the previous example there is no way to use the axle_wheelset module and end up creating an axle that has different wheels on each side. This would not happen even if you passed/defined two different objects inside the curly brackets when calling the axle_wheelset module, because only the first one, children(0), is referenced for both sides of the axle.

**Code** — `axle_with_same_wheels_from_module.scad`

```openscad
axle_wheelset() {
    complex_wheel();
    simple_wheel();
}
```

In order to create an axle with different wheels on each side, the definition of the of the axle_wheelset module would need to be modified. Instead of referencing the first object, children(0), for both sides, the axle_wheelset module would need to reference the first object, children(0), for one side and the second object, children(1), for the second side.

**Code**

```openscad
module axle_wheelset(track=35, radius=2) {
    translate([0,track/2,0])
        children(0);
    axle(track=track, radius=radius);
    translate([0,-track/2,0])
        children(1);
}
```

By defining two different wheel objects inside the curly brackets, the following model would be created.

**Code** — `axle_with_different_wheels_from_parameterized_module.scad`

```openscad
axle_wheelset() {
    complex_wheel();
    simple_wheel();
}
```

> **Exercise**
> Try swapping the order in which the wheels are defined inside the curly brackets when calling the axle_wheelset module. What happens?

**Code** — \[Expand\]

> **Exercise**
> Try defining only one wheel inside the curly brackets? Do you get an error message?

**Code** — \[Expand\]

> **Exercise**
> Add an axle_wheel module on the vehicle_parts.scad script. Make use of the children command to parameterize the specific choice of wheel design. Use the vehicle_parts.scad script on another script to create any vehicle design that you like.

The material you have been learning in the last two chapters gives you a powerful set of tools to start creating your own library of objects that can be flexibly combined and customized to create new designs.

## Challenge

> **Exercise**
> Think of any model that you would like to create. Break it down into different parts. Come up with alternative designs for each part and define modules that create them. What should the input parameters of each module be? Define one or more modules using the children functionality in order to flexibly combine the various parts that you have created.

---

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_Tutorial/Chapter_5&oldid=4374649"


---

# OpenSCAD Tutorial/Chapter 6

In the previous chapters you have made use of variables to parameterize your designs and make them easily customizable. Specifically, you have been assigning them numerical values at some part of your script and then using their stored value in some other part. For example, you can set a wheel_radius variable equal to the desired wheel radius and use that variable in the corresponding statements that create the wheels of your car. This way you can easily customize the radius of your car's wheels without having to search for and change multiple values, but only by directly changing the value of the wheel_radius variable.

You also learned about an important property of OpenSCAD variables. This is that a variable can only have one specific value. If you assign one value to a variable and then assign it a different value at a later part of the script, your variable will have only the final value throughout the execution of your design. This is demonstrated on the following example.

## OpenSCAD variables

**Code** — `two_cylinder_with_same_radius.scad`

```openscad
$fa=1;
$fs=0.4;
height=10;
radius=5;
cylinder(h=height,r=radius);
radius=10;
translate([30,0,0])
cylinder(h=height,r=radius);
```

Both cylinders have a radius of 10 units, which is the last value that is assigned to the radius variable.

When variables store numerical values, they can be used to specify dimensions of different objects or define transformation commands. Numerical values aren't the only kind of values that can be assigned to a variable. Variables can also hold boolean values (true or false) as well as characters (a, b, c, d, …). As you are going to see on the following topics, by using boolean or character variables you can further parameterize your models and modules.

So far you have been assigning specific values to variables using appropriate assignment commands. There are cases, though, where you would prefer the assignment itself to be parametric and dependent on some aspect of your design.

The creation of a car's body requires the definition of various parameters. These parameters can be defined when calling the body module by using corresponding variables that have been defined in your script. One example of this is the following.

## Conditional variable assignment

**Code** — `parameterized_car_body.scad`

```openscad
use <vehicle_parts.scad>
$fa=1;
$fs=0.4;
base_length = 60;
top_length = 30;
top_offset = 5;
body(base_length=base_length, top_length=top_length, top_offset=top_offset);
```

The above version of the car's body will be called the short version. By choosing different values for the variables a long version can also be created.

**Code** — `long_car_body.scad`

```openscad
use <vehicle_parts.scad>
$fa=1;
$fs=0.4;
base_length = 80;
top_length = 50;
top_offset = 10;
body(base_length=base_length, top_length=top_length, top_offset=top_offset);
```

What if these two versions of the car's body are the only versions that you currently interested in? Is there a way to quickly switch between these two versions without having to modify each variable separately?

You may think modifying three variables isn't much work, but the number of required variables on more complex models can easily get unmanageable. Luckily there is a solution to this problem, which is the conditional assignment of variables. The conditional assignment of variables is a way to instruct OpenSCAD to assign different values to variables depending on whether some condition is true or false. In this case the condition is whether the car's body should be long or not. You can represent this condition by defining a long_body variable and setting it equal to true if you want the body to be long or equal to false if you don't want the body to be long.

The choice of a long body is represented by the following statement.

**Code**

```openscad
long_body = true;
```

Respectively the choice of a short body is represented by the following statement.

**Code**

```openscad
long_body = false;
```

The long_body variable is called a boolean variable because boolean values (true or false) are assigned to it. The next step is the definition of the conditional assignments which will assign the appropriate values to base_length, top_length and top_offset variables depending on the value of the long_body variable. These conditional assignments can be defined in the following manner.

**Code**

```openscad
base_length = (long_body) ? 80:60;
top_length = (long_body) ? 50:30;
top_offset = (long_body) ? 10:5;
```

You should notice the following points about the definition of a conditional assignment. First the name of variable is typed out followed by the equal sign. Then follows a pair of parentheses that contains the condition which will be used in the conditional assignment. The condition in this case is a boolean variable. In general, the condition can also be a combination of logical and comparison operations between multiple variables. After the closing parenthesis follow a question mark and the two corresponding variable values that are separated by a colon. If the supplied condition is true, the first value will be the one assigned to the variable. If the supplied condition is false, the second values will be the one assigned to the variable.

By incorporating the above conditional assignments in your script, you can switch between a short and a long car body just by changing the long_body variable from false to true and vice versa.

**Code** — `car_with_normal_conditional_body.scad`

```openscad
use <vehicle_parts.scad>
$fa=1;
$fs=0.4;
// Conditional assignment of body variables
long_body = false;
base_length = (long_body) ? 80:60;
top_length = (long_body) ? 50:30;
top_offset = (long_body) ? 10:5;
// Creation of body
body(base_length=base_length, top_length=top_length, top_offset=top_offset);
// Creation of wheels and axles
track = 30;
wheelbase = 40;
wheel_radius = 8;
wheel_width = 4;
// Front left wheel
translate([-wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Front right wheel
translate([-wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Rear left wheel
translate([wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Rear right wheel
translate([wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Front axle
translate([-wheelbase/2,0,0])
axle(track=track);
// Rear axle
translate([wheelbase/2,0,0])
axle(track=track);
```

**Code** — `car_with_long_conditional_body.scad`

```openscad
use <vehicle_parts.scad>
$fa=1;
$fs=0.4;
// Conditional assignment of body variables
long_body = true;
base_length = (long_body) ? 80:60;
top_length = (long_body) ? 50:30;
top_offset = (long_body) ? 10:5;
// Creation of body
body(base_length=base_length, top_length=top_length, top_offset=top_offset);
// Creation of wheels and axles
track = 30;
wheelbase = 40;
wheel_radius = 8;
wheel_width = 4;
// Front left wheel
translate([-wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Front right wheel
translate([-wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Rear left wheel
translate([wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Rear right wheel
translate([wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Front axle
translate([-wheelbase/2,0,0])
axle(track=track);
// Rear axle
translate([wheelbase/2,0,0])
axle(track=track);
```

> **Exercise**
> Add a large_wheels variable to the previous example. The variable should only take boolean values. Add two conditional assignments that assign different values to the wheel_radius and wheel_width variables. The large_wheels variable should be used as the condition for both assignments. If the large_wheels variable is false, the wheel_radius and wheel_width variables should be set equal to 8 and 4 units respectively. If the large_wheels variable is true, the wheel_radius and wheel_width variables should be set equal to 10 and 8 units respectively. Set appropriate values to the long_body and large_wheels variables to create the following versions of the car: short body - large wheels, short body - small wheels, long body - large wheels, long body - small wheels.

**short body - large wheels**

**Code** — \[Expand\]

**short body - small wheels**

**Code** — \[Expand\]

**long body - large wheels**

**Code** — \[Expand\]

**long body - small wheels**

**Code** — \[Expand\]

## More conditional variable assignments

The conditional assignment of variables can also be used with a properly adjusted syntax when there are more than two cases between which you would like to choose. In the previous example there were only two options for the body (short or long) and a boolean variable (long_body) was used to choose between those two options.

What if you want to be able to choose between four versions of the body (short, long, rectangular and normal)? A boolean variable can't be used to represent your choice of body version since it can only have two values (true or false). For this reason, you are going to use a character to represent your choice of body.

The choice of a short body will be represented by the character s.

**Code**

```openscad
body_version = "s";
```

The choice of a long body will be represented by the character l.

**Code**

```openscad
body_version = "l";
```

The choice of a rectangular body will be represented by the character r.

**Code**

```openscad
body_version = "r";
```

The choice of a normal body will be represented by the character n.

**Code**

```openscad
body_version = "n";
```

The conditional assignments when there are more than two options should take the following form.

**Code**

```openscad
// base_length
base_length =
(body_version == "l") ? 80:
(body_version == "s") ? 60:
(body_version == "r") ? 65:70;
// top_length
top_length =
(body_version == "l") ? 50:
(body_version == "s") ? 30:
(body_version == "r") ? 65:40;
// top_offset
top_offset =
(body_version == "l") ? 10:
(body_version == "s") ? 5:
(body_version == "r") ? 0:7.5;
```

You should notice the following points about the definition of a conditional assignment when there are more than two options. First the name of the variable is typed out followed by the equal sign. Then follows a pair of parentheses that contains a condition, then a question mark, then the value to be assigned if the condition is true and then a colon. The previous sequence is repeated as required depending on the number of different available body versions. The last sequence is slightly different as it has an additional value which will be used as the default value when none of the conditions are true. In this case the default value corresponds to the normal version of the body. This is the reason why the character n that corresponds to the normal version of the body doesn't participate in any condition. Another thing you should notice is that the conditions are now comparison operations, specifically equality comparisons. If the value of the body_version variable is equal to the character that follows the double equal sign, then the condition is true and the corresponding value that follows the condition will be assigned to the variable.

By incorporating the above conditional assignments in your script, you can switch between a short, a long, a rectangular and a normal car body just by setting the body_version equal to the character s, l, r or n respectively.

**Code** — `car_with_long_body_version.scad`

```openscad
use <vehicle_parts.scad>
$fa=1;
$fs=0.4;
// Conditional assignment of body variables
body_version = "l";
// base_length
base_length =
(body_version == "l") ? 80:
(body_version == "s") ? 60:
(body_version == "r") ? 65:70;
// top_length
top_length =
(body_version == "l") ? 50:
(body_version == "s") ? 30:
(body_version == "r") ? 65:40;
// top_offset
top_offset =
(body_version == "l") ? 10:
(body_version == "s") ? 5:
(body_version == "r") ? 0:7.5;
// Creation of body
body(base_length=base_length, top_length=top_length, top_offset=top_offset);
// Creation of wheels and axles
large_wheels = false;
wheel_radius = (large_wheels) ? 10:6;
wheel_width = (large_wheels) ? 8:4;
track = 30;
wheelbase = 40;
// Front left wheel
translate([-wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Front right wheel
translate([-wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Rear left wheel
translate([wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Rear right wheel
translate([wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel(wheel_radius=wheel_radius, wheel_width=wheel_width);
// Front axle
translate([-wheelbase/2,0,0])
axle(track=track);
// Rear axle
translate([wheelbase/2,0,0])
axle(track=track);
```

**Code** — `car_with_short_body_version.scad`

```openscad
…
body_version = "s";
…
```

**Code** — `car_with_rectangular_body_version.scad`

```openscad
…
body_version = "r";
…
```

**Code** — `car_with_normal_body_version.scad`

```openscad
…
body_version = "n";
…
```

> **Exercise**
> Add a wheels_version variable to the previous example. The variable should only take character values. Add appropriate conditional assignments that assign different values to the wheel_radius and wheel_width variables. The wheels_version variable should be used as the condition for both assignments. If the value of the wheels_version variable is the character s (small), the wheel_radius and wheel_width variables should be set equal to 8 and 4 units respectively. If the value of the wheels_version variable is the character m (medium), the wheel_radius and wheel_width variables should be set equal to 9 and 6 units respectively. If the value of the wheels_version variable is the character l (large), the wheel_radius and wheel_width variables should be set equal to 10 and 8 units respectively. The case of the small version of the wheels should be used as the default case of the conditional assignments. Set appropriate values to the body_version and wheels_version variables to create the following versions of the car: short body - medium wheels, rectangular body - large wheels, normal body - small wheels.

**short body - medium wheels**

**Code** — \[Expand\]

**rectangular body - large wheels**

**Code** — \[Expand\]

**normal body - small wheels**

**Code** — \[Expand\]

## Conditional creation of objects - If statement

Conditional assignment of variables is a great tool to easily navigate between different but specific versions of your model. Using conditional assignments, you were able to define different body and wheel sizes for your car and effortlessly choose between them without having to manually provide the values for all involved variables every single time.

What if you wanted to have the same control over the type of wheel (ex. simple, round, complex) or body (ex. square, round)? What would this require? In order to achieve this, you would need to have conditional creation of objects, which can be achieved with the use of the if statement.

Before you go into customizing the type of wheel and body, you can get familiar with if statements with some shorter examples. Recall the car body module that you created in a previous chapter. The module has some input parameters which are used to create two cubes, one cube for the body's base and one for the body's top.

**Code** — `car_body_from_module.scad`

```openscad
module body(base_height=10, top_height=14, base_length=60, top_length=30, width=20, top_offset=5) {
// Car body base
cube([base_length,width,base_height],center=true);
// Car body top
translate([top_offset,0,base_height/2+top_height/2])
cube([top_length,width,top_height],center=true);
}
$fa = 1;
$fs = 0.4;
body();
```

Using an if statement you are going to see how the creation of the body's top can be parameterized. First you need to define an additional input parameter for the module. This parameter will be named top and will hold boolean values. If this parameter is false, the module should create only the base of the body. If it's true, it should also create the top of the body. This can be achieved by using an if statement in the following way.

**Code**

```openscad
module body(base_height=10, top_height=14, base_length=60, top_length=30, width=20, top_offset=5, top) {
// Car body base
cube([base_length,width,base_height],center=true);
// Car body top
if (top) {
translate([top_offset,0,base_height/2+top_height/2])
cube([top_length,width,top_height],center=true);
}
}
$fa = 1;
$fs = 0.4;
```

You should notice the following points regarding the definition of the if statement. First the if keyword is typed out and then follows a pair of parentheses. Inside of the parentheses the condition that will dictate whether the if statement will be executed is defined. Lastly, there is a pair of curly brackets inside of which exist all statements that will be executed if the supplied condition is true. In this case the supplied condition is the boolean variable top, which represents your choice to create a car body that does or doesn't have a top part. The statement that is placed inside the curly brackets is the statement that creates the top part of the car's body.

This particular form of if statement is known as a simple if statement. This means that if the condition is true then the corresponding commands are executed, otherwise nothing happens. There are two other forms of the if statement that will be covered later, but first take a moment to investigate how the new body module works in practice.

When the input parameter top is set to false, only the base of the body is created.

**Code** — `car_body_without_top.scad`

```openscad
…
body(top=false);
…
```

When it's set to true, both the base and the top of the body are created.

**Code** — `car_body_with_top.scad`

```openscad
…
body(top=true);
…
```

> **Exercise**
> Take a look at the following car body module. You will notice that the module has been modified to include the creation of a rear bumper. The color command that has been applied to the bumper simply adds a visual effect during preview. In this case, the color command is used to draw your attention on the newly added part; it shouldn't bother you any further than that.

**Code** — `car_body_with_rear_bumper.scad`

```openscad
module body(base_height=10, top_height=14, base_length=60, top_length=30, width=20, top_offset=5, top) {
// Car body base
cube([base_length,width,base_height],center=true);
// Car body top
if (top) {
translate([top_offset,0,base_height/2+top_height/2])
cube([top_length,width,top_height],center=true);
}
// Rear bumper
color("blue") {
translate([base_length/2,0,0])rotate([90,0,0]) {
cylinder(h=width - base_height,r=base_height/2,center=true);
translate([0,0,(width - base_height)/2])
sphere(r=base_height/2);
translate([0,0,-(width - base_height)/2])
sphere(r=base_height/2);
}
}
}
$fa = 1;
$fs = 0.4;
body(top=true);
```

> **Exercise**
> To create the front bumper, copy and paste the statements that create the rear bumper and modify the translation statement accordingly.

**Code** — \[Expand\]

> **Exercise**
> Define two additional input parameters for the body module. One named front_bumper and one named rear_bumper. Keeping in mind that these parameters should take boolean values define two if statements that conditionally create the front and rear bumpers. The front bumper should be created only if the front_bumper input parameter is true, the second bumper accordingly. Use the body module to create the following car bodies: base only - front and rear bumper, base and top - front bumper, base and top - front and rear bumper.

**base only - front and rear bumper**

**Code** — \[Expand\]

**base and top - front bumper**

**Code** — \[Expand\]

**base and top - front and rear bumper**

**Code** — \[Expand\]

## Challenge

In this chapter you learned about conditional assignment of variables and simple if statements. Specifically, you learned how to conditionally modify dimensions and transformations of parts of your designs as well as how to conditionally include or exclude parts from them. It's time to put these two together in a single car model.

> **Exercise**
> If you have been following along this tutorial you should have a vehicle_parts.scad script on your machine from a previous chapter. Open this script and update the body module according to the last example so that it has the ability to conditionally create the top of the body as well as a front and a rear bumper. Set default values for the newly added input parameters. Specifically set true, false and false as the default value of the top, front_bumper and rear_bumper variable accordingly. Save the changes and close the script.

**Code** — \[Expand\]

> **Exercise**
> Given the following script that creates a car, make appropriate additions and modifications to the script in order to parameterize conditionally the design of the car. Specifically, you will need to define a body_version, a wheels_version, a top, a front_bumper and a rear_bumper variable that will be used for making design choices regarding the car's design. If necessary, review the previous examples and exercises of this chapter to remember what effect these variables should have on the design of the car and how to implement them. Use the resulting script to create a version of the car that you like.

**Given script**

**Code** — `basic_car_script.scad`

```openscad
use <vehicle_parts.scad>
$fa=1;
$fs=0.4;
// Variables
track = 30;
wheelbase=40;
// Body
body();
// Front left wheel
translate([-wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel();
// Front right wheel
translate([-wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel();
// Rear left wheel
translate([wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel();
// Rear right wheel
translate([wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel();
// Front axle
translate([-wheelbase/2,0,0])
axle();
// Rear axle
translate([wheelbase/2,0,0])
axle();
```

**Modified script**

**Code** — \[Expand\]

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_Tutorial/Chapter_6&oldid=4374650"*

---

# OpenSCAD Tutorial/Chapter 7

In the previous chapter you used if statements to control whether some part of your design should be created or not. In this chapter you are going to find out how you can create multiple parts or objects when they form a specific pattern.

Given the following car model as an example you are going to learn how to create such patterns.

## Creating repeating patterns of parts/models - For loops

**Code** — `single_car.scad`

```openscad
use <vehicle_parts.scad>
$fa=1;
$fs=0.4;
// Variables
track = 30;
wheelbase=40;
// Body
body();
// Front left wheel
translate([-wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel();
// Front right wheel
translate([-wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel();
// Rear left wheel
translate([wheelbase/2,-track/2,0])
rotate([0,0,0])
simple_wheel();
// Rear right wheel
translate([wheelbase/2,track/2,0])
rotate([0,0,0])
simple_wheel();
// Front axle
translate([-wheelbase/2,0,0])
axle(track=track);
// Rear axle
translate([wheelbase/2,0,0])
axle(track=track);
```

> **Exercise**
> Take the above car example and modify it in order to create another car. To avoid duplicating the code that creates the car you should create a car module. The module should have two input parameters, the track and the wheelbase of the car. The default value of the track and the wheelbase should be 30 and 40 units respectively. The first car should be positioned at the origin as the example above, the second car should be translated along the positive direction of the Y axis by 50 units.

**Code** — \[Expand\]

> **Exercise**
> Create eight additional cars along the positive direction of the Y axis so that you have ten cars in total. Every next car should be translated 50 units along the positive direction of the Y axis in comparison to the previous car.

**Code** — \[Expand\]

After the previous exercise, you have probably realized that creating a pattern of cars in this manner is not very efficient; a new statement has to be written for every car, and this results in a lot of code duplication in your script. Typically, you can use a for loop to achieve the same results a lot easier. The for loop provides a way to repeat the same set of statements a certain number of times, with small, predictable changes applied each time. Take a look at the following example.

**Code** — `row_of_ten_cars_along_y_axis_with_for_loop.scad`

```openscad
…
for (dy=[0:50:450]) {
translate([0,dy,0])
car();
}
…
```

There are a few things you should notice about the syntax of the for loop. First the keyword for is typed out followed by a pair of parentheses. Inside the parentheses the variable of the for loop is defined. It's advisable to give a descriptive name to the for loop variables when applicable. In this case the variable is named dy because it represents the number of units that each car needs to be translated along the Y axis. The definition of the variable indicates that its first value will be 0 units and all following values will be incremented by 50 units each until the value 450 is reached. This means that the variable dy will take ten different values in total throughout the execution of the for loop repetitions. These values are 0, 50, 100, 150, 200, 250, 300, 350, 400 and 450. These values form a vector, which in contrast to a single value is a sequence of values. In the first repetition the variable will take the first value of the vector, which is 0. In the second repetition the second value, which is 50. And so forth. The different consecutive values that the for loop variable takes throughout the repetitions of the for loop is the key concept which makes the for loop suitable for creating patterns of multiple parts or models. Finally, after the closing parenthesis follows a pair of curly brackets. Inside the curly brackets exist the statements that will be executed repeatedly as many times as the number of values of the for loop variable. In this case the single statement inside the curly brackets will be executed 10 times which is the number of values that the dy variable will take. To avoid creating 10 cars that are completely overlapping the amount of translation along the Y axis on each repetition of the for loop is parameterized using the dy variable. The dy variable has a different value on each repetition of the for loop thus creating the desired pattern.

> **Exercise**
> Use a for loop to create a pattern of cars. The first car should be centered at the origin. Every next car should be placed behind the previous car. Specifically, every next car should be translated 70 units along the positive direction of the X axis in comparison to the previous car. The pattern should be consisted out of 8 cars in total. The for loop variable should be named dx.

**Code** — \[Expand\]

## Creating more complex patterns

In the previous examples the for loop variable dy was used directly to modify some aspect of each individual model that composes the pattern. The only aspect that was modified was the translation of each model along the Y or X axis. On each repetition the value of the dy variable was equal to the desired translation on each model.

When more than one aspect of the model needs to be modified it's a better practice for the for loop variable to take integer values 0, 1, 2, 3 etc. The required values for modifying different aspects of the model (ex. translation along some axis, scaling of some part) are then produced from those integer values that the for loop variable takes. In the following example this concept is used to simultaneously translate each car 50 and 70 units along the positive direction of the Y and X axis.

**Code** — `diagonal_row_of_five_cars.scad`

```openscad
…
for (i=[0:1:4]) {
translate([i*70,i*50,0])
car();
}
…
```

There are a few things you should notice. The for loop variable is now named i. When the for loop variable is used in this way it's usually called index and given the name i. Since the for loop variable takes integer values you need to multiply it by a proper number to produce the desired amount of translation along each axis. Specifically, the desired amount of translation along the Y axis is produced by multiplying the for loop variable by 50. Similarly the desired amount of translation along the X axis is produced by multiplying the for loop variable by 70.

> **Exercise**
> Add a rotation transformation to the previous example in order to turn the car around the Z axis. The first car shouldn't be turned at all. Each next car should be turned by 90 degrees around the positive direction of rotation of the Z axis in comparison to the previous car. The positive direction of rotation of the Z axis is the one that would rotate the X axis towards the Y axis. Does the rotation transformation need to be applied before or after the translation transformation in order to keep the cars in the same position?

**Code** — \[Expand\]

The patterns you are creating are already becoming cooler, here is an interesting one.

**Code** — `circular_pattern_of_ten_cars.scad`

```openscad
…
r = 200;
for (i=[0:36:359]) {
translate([r*cos(i),r*sin(i),0])
car();
}
…
```

In the above pattern the cars have been placed at equally spaced points at the circumference of a perfect circle that has a radius of 200 units. There are a few important points you should pay attention to if you wish to create such patterns.

The first is that in order to create a circular pattern you need to use polar coordinates. Depending on your background you may have noticed the use of polar coordinates just by glancing at the code or you may have no idea what it is. In the latter case, the only thing that you need to know is that polar coordinates are a way to produce the X and Y coordinates of a given point of a circle when you know the radius of the circle and the angle that corresponds to that point. The angle 0 corresponds to the point of the circle that belongs to the positive direction X axis. The positive counting direction of the angle is from the X to the Y axis. This means the positive Y axis corresponds to 90 degrees, the negative X axis to 180 degrees, the negative Y axis to 270 degrees and if you complete the circle the positive X axis to 360 degrees. According to the polar coordinates the X coordinate can be calculated by multiplying the radius of the circle by the cosine of the angle, while the Y coordinate can be calculated by multiplying the radius of the circle by the sine of the angle. This is how the desired amount of translation along the X and Y axis is produced.

The second thing you should notice is what values the for loop variable i takes. The variable i starts from 0 and is incremented by 36 on each repetition in order to position 10 equally spaced cars on the circle (360/10 = 36). The first car that is created at 0 angle and the car that correspond to 360 degrees would be exactly overlapping. In order to avoid this, you need to instruct the for loop variable to stop incrementing before it reaches 360. If you are lazy calculating 360 - 36 = 324, you can just put the limit at 359. This will work fine because the for loop variable will only take the values 0, 36, 72, 108 144, 180, 216, 252, 288 and 324, since incrementing by another 36 units would result in 360 which exceeds 359.

By using additional variables and naming them properly you can make your scripts more descriptive and usable so that it's easier for anyone (or even you at a later point in time) to understand what they are doing and how to use them. For example, the previous script can take the following form.

**Code**

```openscad
…
r = 200; // pattern radius
n = 10; // number of cars
step = 360/n;
for (i=[0:step:359]) {
angle = i;
dx = r*cos(angle);
dy = r*sin(angle);
translate([dx,dy,0])
car();
}
…
```

On the above script it is self-explanatory that the for loop variable i corresponds to the angle. It is also clearer what the amount of translation along each axis is. In addition, it is easy to customize this pattern by changing the radius and/or the number of cars.

> **Exercise**
> Modify the appropriate values on the above script in order to create a pattern of 14 equally spaced cars on the circumference of circle with radius of 160 units.

**Code** — \[Expand\]

> **Exercise**
> If you are not familiar with polar coordinates play around with the following script. Try assigning different values to the radius and the angle variables and see what the resulting position of the car is.

**Code** — \[Expand\]

**Code** — `parametric_circular_pattern_of_fourteen_cars.scad`

```openscad
…
r = 160; // pattern radius
n = 14; // number of cars
step = 360/n;
for (i=[0:step:359]) {
angle = i;
dx = r*cos(angle);
dy = r*sin(angle);
translate([dx,dy,0])
car();
}
…
```

### Challenge

> **Exercise**
> The above script was used to create a circular pattern of cars. Modify the above script by adding a rotation transformation in order to make all car face the origin. Use your modified script to create a pattern that has 12 cars and a radius of 140 units.

**Code** — \[Expand\]

> **Exercise**
> Make appropriate changes to the above script to create: i) one pattern where all cars are facing away from the origin ii) one pattern where all cars are oriented tangentially as if driving counter clockwise around a circle iii) and one as if driving clockwise around a circle.

**facing away from the origin**

**Code** — \[Expand\]

**driving counterclockwise**

**Code** — \[Expand\]

**driving clockwise**

**Code** — \[Expand\]

Now that you are getting a hold of using for loops to create patterns it's time to put you new skills in the development of a more sophisticated wheel design!

> **Exercise**
> If you feel confident with your OpenSCAD skills or if you would like to experiment a bit more, try to build a new module named spoked_wheel that creates the following wheel design. If you would like some more guidance with creating this module go through the following exercises instead.

> **Exercise**
> If you feel more comfortable with some additional guidance that's fine. Create a new module named spoked_wheel that has 5 input parameters. The input parameters should be named radius, width, thickness, number_of_spokes and spoke_radius. Give these variables the default values of 12, 5, 5, 7 and 1.5 respectively. Use the cylinder and difference commands to create the ring of the wheel by subtracting a small cylinder from a bigger one. The model that you need to create can be seen on the following image. For this step you are only going to use the radius, width and thickness variables. Remember that when you are subtracting one object from another it needs to clear the face of the other object to avoid any errors. Keep this in mind when defining the height of the small cylinder. You will also need to calculate the radius of the small cylinder from the radius and thickness variables. You can use a variable named inner_radius to store the result of the appropriate calculation and then use it to define the radius of the smaller cylinder.

**Code** — \[Expand\]

> **Exercise**
> Extend the previous module to additionally create the spokes of the wheel as seen on the following image. The spokes of the wheel need to be cylindrical. The length of the spokes needs to be appropriate so that each spoke spans from the center of the ring to its half thickness. You will have to use a for loop to create the spokes as a pattern. Feel free to review previous for loop example that can help you with this.

**Code** — \[Expand\]

> **Exercise**
> For the new wheel design to be compatible with the existing wheel designs and modules that you have created throughout the tutorial, it needs to be rotated to stand straight as in the following image. Add an appropriate rotation transformation to do so.

**Code** — \[Expand\]

> **Exercise**
> Add the spoked_wheel module on the vehicle_parts.scad script. Use the new wheel design in one of your car models. If you don't have any ideas you can try replicating the following model.

**Code** — \[Expand\]

## Creating patterns of patterns - Nested for loops

The following script creates a row of cars along the Y axis.

**Code** — `row_of_six_cars_along_y_axis.scad`

```openscad
…
n = 6; // number of cars
y_spacing = 50;
for (dy=[0:y_spacing:n*y_spacing-1]) {
translate([0,dy,0])
car();
}
…
```

> **Exercise**
> Modify the above script to create 4 additional rows of cars. Each row should be translated by 70 units along the positive direction of the X axis in comparison to the previous row.

**Code** — \[Expand\]

If you have been paying close attention to the tutorial so far, you may have noticed that the script above is not very efficient. It has a lot of code duplication and the number of rows can't be easily modified. You faced a similar situation in the beginning of this chapter when you wanted to create a row of cars. To solve that problem, you wrapped the statement that creates a piece of the pattern (a single car) inside a for loop. This generated the whole pattern (a row of cars) without having to type out a statement for each individual car. The same principle can be applied here. In this case, the repeating pattern will be the row of cars, which itself is a repeating pattern of individual cars. Following the same process as before, the statements that create a row of cars will be placed inside a for loop in order to create the pattern of rows of cars. The result is that a for loop is placed inside of another for loop. For loops that are used in this way are called nested for loops. The following example demonstrates this concept.

**Code** — `five_rows_of_six_cars_with_nested_for_loops.scad`

```openscad
…
n_cars = 6;
y_spacing = 50;
n_rows = 5;
x_spacing = 70;
for (dx=[0:x_spacing:n_rows*x_spacing-1]) {
for (dy=[0:y_spacing:n_cars*y_spacing-1]) {
translate([dx,dy,0])
car();
}
}
…
```

You should notice the following concept. During the first repetition of the outer for loop, all iterations of the inner for loop are executed, thus creating the first row of cars. During the second repetition of the outer for loop all repetitions of the inner for loop are executed, thus creating the second row of cars. And so forth. Each row is positioned by the dx variable, which holds the parameterized translation along the X axis. During each iteration of the outer loop, a new value of dx is used. This value then holds steady while the inner loop executes and modifies the dy value. In this way, a row of cars is generated at each value of dx.

> **Exercise**
> Use nested for loops to create three circular patterns of cars similar to the image below. The for loop variable of the outer loop should be used to parameterize the radius of each pattern. The radius of the circular patterns should be 140, 210 and 280 units respectively. Each pattern should be consisted of 12 cars.

**Code** — \[Expand\]

> **Exercise**
> Modify the script of the previous exercise so that not only the radius but also the number of cars is different for each pattern. To do so use an index variable i as the variable of the outer loop instead of the variable r that corresponds to the radius. The variable r should be calculated at each repetition of the outer for loop according to the formula r = 70 + i\*70. Additionally, on each repetition of the outer for loop the n variable should take different values according to the formula n = 12 + i\*2. The step variable also needs to be updated on each repetition of the outer for loop. The i variable should take the values 1, 2 and 3.

**Code** — \[Expand\]

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_Tutorial/Chapter_7&oldid=4374651"*


---

# OpenSCAD Tutorial/Chapter 8

So far you have been creating a lot of models and customizing your car designs while developing solid parametric modelling skills and exploring different features of OpenSCAD. It's quite impressive when you consider that every model you have created so far makes use of just three primitives: the sphere, the cube and the cylinder. By combining these primitives with the transformation commands you can create a plethora of models, but there are still models that can't be created by using these primitives alone. One such example is the following wheel design.

The above wheel design requires the creation of an object that looks like a donut.

## Rotationally extruding 3D objects from 2D objects

This donut shaped object can't be created with the use of the sphere, cube and cylinder primitives. Instead it requires the use of 2D primitives and a new command which can create 3D shapes from 2D profiles. Specifically, the donut can be created by first defining a circular 2D profile using the circle primitive and then rotationally extruding this profile using the rotate_extrude command.

**Code** — `circular_profile.scad`

```openscad
$fa = 1;
$fs = 0.4;
wheel_radius = 12;
tyre_diameter = 6;
translate([wheel_radius - tyre_diameter/2, 0])
circle(d=tyre_diameter);
```

**Code** — `extruded_donut.scad`

```openscad
$fa = 1;
$fs = 0.4;
wheel_radius = 12;
tyre_diameter = 6;
rotate_extrude(angle=360) {
translate([wheel_radius - tyre_diameter/2, 0])
circle(d=tyre_diameter);
}
```

There are a few things you should notice about the 2D profile that you have created. In this case, the 2D profile is created using the circle command, and the diameter is set equal to the tyre_diameter variable. This was done because the donut-shaped object will correspond to the tyre of the wheel. Later on, you may discover other 2D primitives like the square command.

Any 2D profiles you plan to extrude should be created on the X-Y plane, and typically in the region where X is positive. Defined mathematically, 2D profiles usually reside where X ≥ 0, and Z = 0. Also, 2D profiles always have zero thickness. This means that 2D profiles are never used directly as a part of the model, but are instead used in conjunction with the rotate_extrude and linear_extrude commands to define 3D objects.

You should notice a few things about the use of the rotate_extrude command as well. The rotate extrude command is used to create 3D objects, and always requires a 2D profile as an input. The commands that create the desired 2D profile need to be placed inside the pair of curly brackets that follows the rotate_extrude command. The 3D object that is created by the rotate_extrude command is the result of rotating the 2D profile around the Y axis. The resulting 3D object is then placed so that its axis of rotation lies along the Z-axis. This quirk can take some getting used to at first, so it may help to review the process one step at a time.

First, the rotate_extrude command takes a 2D profile as an input.

Then it creates a 3D object which is the result of rotating the supplied 2D profile around the Y axis.

Finally, it places the 3D model as if it were rotated by 90 degrees around the X axis. The result is that the Y axis which the model was revolved around has been rotated up to align with the Z axis.

The rotate_extrude command has one input parameter named angle. The angle parameter is used to define how many degrees the 2D profile will be rotated around the Y axis. In this case the angle parameter is set equal to 360 degrees which corresponds to a full circle.

Setting the angle parameter equal to 60 degrees would create the following model.

While setting it equal to 270 degrees would create the following one. And so forth.

### Exercise

Complete the new wheel design by defining the missing cylinder object. The height of the cylinder should be equal to the value of a wheel_width variable, while the radius of the cylinder should be equal to wheel_radius - tyre_diameter/2. The cylinder should be centred on the origin.

**Code** — [Expand]

### Exercise

To make this wheel compatible with the models from the previous chapters rotate it by 90 degrees around the X axis. Turn this wheel design into a module named rounded_simple_wheel and add it on your vehicle_parts.scad script for later use.

**Code** — [Expand]

### Exercise

The above wheel is an axisymmetric object, which means it exhibits symmetry around an axis. Specifically, the axis of symmetry is the axis around which the 2D profile was rotated to form the 3D object. When an object is axisymmetric it can be created with just one rotate_extrude command as long as the appropriate 2D profile is supplied. This is not the case with the above wheel design as the center part was added with a cylinder command separate from the rotational extrusion. Remove the cylinder command from the above module and make appropriate additions on the supplied 2D profile so that the whole wheel is created by the rotate_extrude command.

**Code** — [Expand]

**Code** — [Expand]

You should remember that axisymmetric objects can be completely created out of a rotate_extrude command. The previous wheel design is a concrete example of this. Whether you decide to create an axisymmetric object by supplying the 2D profile of the whole object and by using a single rotate_extrude or by using a rotate_extrude command only for its parts that can't be created in any other way, depends on each case and is up to you. If you wanted for example to further modularize your wheel designs and separate them into combinable tire and rim modules, you would inevitably need to create the donut-shaped tire using a rotate_extrude command. Since in this case the rim of the wheel would be a separate module without a rotate_extrude command already present in it, the simplest and most straight forward way to create it would be by using a cylinder command.

It's time to put your new knowledge into practice to create a rim for a mini robot car project.

### Challenge

### Exercise

Extend the rounded_simple_wheel module, so that the wheel design has a hole on its hub that can be used for mounting it on an axle. To do so you would need to subtract a cylinder from the existing model using a difference command. The diameter of the hole should be equal to a new module input parameter named axle_diameter. The default value of this parameter should be 3 units. By the way in which you define the height of the cylinder you should guarantee that the cylinder is always a bit longer than the width of the wheel to avoid any errors when using the difference command. After saving the modified module you should use it to create a version a wheel with wheel_radius, wheel_width, tire_diameter and axle_diameter of 20, 6, 4 and 5 units respectively.

**Code** — [Expand]

**Code** — [Expand]

This wheel design looks about right for a mini robot car application, but you could do something to give more traction to your robot. Instead of 3D printing the whole wheel, you could just 3D print the rim and then add an O-ring or rubber band as the tire for more traction. The resulting wheel would look like the following image, where the O-ring or rubber band is represented by the blue color.

The corresponding rim that you would have to 3D print in this case is the following.

### Exercise

Using the rounded_simple_wheel module as a guide, create a new module named robot_rim. The robot_rim module should have the same input parameters as the rounded_simple_wheel module. Add all necessary commands to the robot_rim module so that it creates the above rim design. There are two ways in which you can do this.

The first way is to subtract the circle that corresponds to the tire from the square that corresponds to the rim in the definition of the design's 2D profile inside the rotate_extrude command and then to additionally subtract the axle's cylinder from the resulting 3D object to get the final rim design.

The second way is to subtract a donut-shaped object that corresponds to the tire and the cylinder that corresponds to the axle hole from the larger cylinder that corresponds to the rim.

Remember, while there is some conventional wisdom surrounding good design practices, there is no objectively right or wrong choice. In practice you would most likely go with the option that first came to mind or that made the most sense to you. For the sake of this exercise, consider trying it both ways to see which approach you like the most.

**First approach**

**Code** — [Expand]

**Second approach**

**Code** — [Expand]

Often, it's helpful to consider the manufacturing process that will be used in an object's creation when designing a new part. Usually, this consideration promotes designs that accommodate the manufacturing method at hand, but it can guide your modeling process as well.

For example, consider a scenario where instead of using additive manufacturing like 3D printing to manufacture this robot wheel, you used subtractive manufacturing like lathe or a mill. In this case you might opt to use the second approach, since it would more closely replicate the manufacturing process at hand, and could give you a better estimate of how many steps the final manufacturing process might take.

As briefly mentioned, there is another OpenSCAD command that can be used to create 3D objects from supplied 2D profiles. This is the linear_extrude command. In contrast to the rotate_extrude command, linear_extrude creates a 3D object by extending along the Z axis a 2D profile that lies on the XY plane. Similar to the rotate_extrude command, linear_extrude can be used when the 3D object you want to create can't be directly created by combining available 3D primitives. One such example is the following.

## Linearly extruding 3D objects from 2D objects

**Code** — `extruded_ellipse.scad`

```openscad
$fa = 1;
$fs = 0.4;
linear_extrude(height=50)
scale([2,1,1])
circle(d=10);
```

The above object is a tube that has the following profile.

**Code** — `ellipse_profile.scad`

```openscad
$fa = 1;
$fs = 0.4;
scale([2,1,1])
circle(d=10);
```

There are a few points you should notice regarding the use of linear_extrude. The syntax of linear_extrude is similar to the syntax of the rotate_extrude command. The commands that create the 2D profile that will be extruded along the Z axis need to be placed inside a pair of curly brackets that follows the linear_extrude command. The parameter height is used to define how many units along the Z axis the 2D profile is going to be extruded. By default, the 2D profile is extruded along the positive direction of the Z axis by an amount of units equal to the value assigned to the height parameter.

By passing an additional parameter named center and setting it equal to true, the 2D profile is extruded along both directions of the Z axis. The total length of the resulting object will still be equal to the height parameter.

**Code** — `centered_extrusion.scad`

```openscad
…
linear_extrude(height=50,center=true)
scale([2,1,1])
circle(d=10);
…
```

An additional parameter named twist can also be used to twist the resulting 3D object around the Z axis by the specified angle.

**Code** — `extrusion_with_twist.scad`

```openscad
…
linear_extrude(height=50,center=true,twist=120)
scale([2,1,1])
circle(d=10);
…
```

Finally, another parameter named scale can be used to scale one end of the resulting 3D by the specified scaling factor.

**Code** — `extrusion_with_twist_and_scale.scad`

```openscad
…
linear_extrude(height=50,center=true,twist=120,scale=1.5)
scale([2,1,1])
circle(d=10);
…
```

It should be pretty clear by now how the rotate_extrude and linear_extrude commands give you the ability to create objects that wouldn't be possible by directly combining the available 3D primitives. You can use these commands to create more abstract and artistic designs but let's see how you could use the linear_extrude command to create a new car body.

### Exercise

Use the linear_extrude command similar to the above examples in order to create the following car body. You should create a new module named extruded_car_body. The module should have a length, rear_height, rear_width and scaling_factor input parameter. The default values of the parameters should be 80, 20, 25 and 0.5 units respectively. The length and scaling factor parameters of the module will be used in the call to linear_extrude command to set the values of its height and scale parameters. The supplied 2D profile should be a circle that has been resized according to the rear_height and rear_width parameters.

**Code** — [Expand]

### Exercise

Extend the previous module by adding a boolean input parameter named rounded. The default value of the parameter should be false. If the rounded parameter is set to true, then two additional objects should be created at the front and rear of the body in order to make in rounded as in the following image. These two objects are spheres that have been resized and scaled. Try figuring out an appropriate way to resize and scale the sphere to achieve a result similar to the image below.

**Code** — [Expand]

### Exercise

Use the new rounded body in any car design that you like.

As mentioned, the rotate_extrude and linear_extrude commands can also be used to create more abstract objects. When the supplied 2D profile is created using the available circle and square 2D primitives and when the twist and scale parameters of the linear_extrude command are not utilized, then the resulting 3D object could also be directly created using the available 3D primitives. What really makes the use of these commands much more powerful is the ability to create any 2D profile that is not a combination of circles and squares but rather an arbitrary shape. This ability is available through the use of the polygon 2D primitive which you are going to learn about in the next chapter.

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_Tutorial/Chapter_8&oldid=4374652"*

---

# OpenSCAD Tutorial/Chapter 9

So far you have learned that OpenSCAD variables can hold only one value throughout the execution of a script, the last value that has been assigned to them. You have also learned that a common use of OpenSCAD variables is to provide parameterization of your models. In this case every parameterized model would have a few independent variables, whose values you can change to tune that model. These variables are usually directly assigned a value as in the following examples.

**Code**

```openscad
…
wheel_diameter = 12;
…
body_length = 70;
…
wheelbase = 40;
…
// etc.
…
```

Another thing that you have seen a few times already, but which has not been mentioned explicitly is the ability to perform mathematical operations using variables and hard-coded values in your script. One example of this is in implementing the car's wheelbase. Recall that the car's axles and wheels were translated along the X axis and away from the origin by half the value of the wheelbase. Since in this case the wheelbase is a variable that has already been defined in your script, you can calculate the amount of units by dividing the wheelbase variable by two. A similar thing was done with the track variable to place the left and right wheels of the car. Recall that the left and right wheels were translated along the Y axis and away from the origin by half the value of the track.

## Doing math calculations in OpenSCAD

**Code** — `axle_with_wheelset.scad`

```openscad
use <vehicle_parts.scad>
$fa = 1;
$fs = 0.4;
wheelbase = 40;
track = 35;
translate([-wheelbase/2, track/2])
simple_wheel();
translate([-wheelbase/2, -track/2])
simple_wheel();
translate([-wheelbase/2, 0, 0])
axle(track=track);
```

Addition, subtraction, multiplication and division are represented in OpenSCAD with the signs +, -, * and /. Apart from these fundamental operations, there are also a number of additional mathematical operations that can be useful when building more complex models. Two examples of this are the cosine and sine functions that you used to define a circular pattern of cars. Specifically, you used the cosine and sine functions to transform the polar coordinates of each car into Cartesian coordinates in order to translate it in its proper position. You can find all available math functions briefly listed in the cheat sheet.

**Code** — `circular_pattern_of_cars.scad`

```openscad
…
r = 140; // pattern radius
n = 12; // number of cars
step = 360/n;
for (i=[0:step:359]) {
angle = i;
dx = r*cos(angle);
dy = r*sin(angle);
translate([dx,dy,0])
rotate([0,0,angle])
car();
}
…
```

In the above case you are not only using available mathematical operations in your script, but you are also defining two additional variables dx and dy to store the result of your calculations in order to increase the readability of your script. This is something that could also be done in your car models. Take for example the following car model.

**Code** — `car.scad`

```openscad
use <vehicle_parts.scad>
$fa = 1;
$fs = 0.4;
wheelbase = 40;
track = 35;
// Body
body();
// Front left wheel
translate([-wheelbase/2,-track/2,0])
simple_wheel();
// Front right wheel
translate([-wheelbase/2,track/2,0])
simple_wheel();
// Rear left wheel
translate([wheelbase/2,-track/2,0])
simple_wheel();
// Rear right wheel
translate([wheelbase/2,track/2,0])
simple_wheel();
// Front axle
translate([-wheelbase/2,0,0])
axle(track=track);
// Rear axle
translate([wheelbase/2,0,0])
axle(track=track);
```

In the above model, mathematical operations are used to calculate the required amount of translation for each wheel and axle along the X and Y axis.

### Exercise

Modify the above script in order to improve its readability and avoid repeating the same mathematical operations multiple times. To do so you should introduce two new variables named half_wheelbase and half_track. Use the corresponding mathematical calculation to set these variables equal to half the value of the wheelbase and the track variables accordingly. Replace the repeating mathematical operations in the translation commands with the use of these two variables.

**Code** — [Expand]

## Creating any 2D object with the polygon primitive

Aside from the circle and square 2D primitives, there is another primitive that lets you design practically any 2D object. This is the polygon primitive, which lets you define 2D objects by providing a list that contains the coordinates of their points. Let's say you want to design the following 2D part.

One way to go about designing this part without using the polygon primitive would be to start from a square that corresponds to the outer dimensions of this part and then subtract a properly rotated and translated square from its top right corner. Calculating the proper angle of rotation and amount of translation would be a time-consuming task. Additionally, following this strategy for a more complex object wouldn't be possible. Instead, you can create this object using the polygon primitive in the following way.

**Code** — `profile_1_polygon.scad`

```openscad
p0 = [0, 0];
p1 = [0, 30];
p2 = [15, 30];
p3 = [35, 20];
p4 = [35, 0];
points = [p0, p1, p2, p3, p4];
polygon(points);
```

There are a few things you should notice regarding the use of the polygon primitive. The polygon primitive uses a list of points as inputs. The points, or vertices, are represented using pairs of X and Y coordinates, and are provided in order. When defining the list, you may start with any vertex you like and you can traverse them in either a clockwise or counterclockwise order. In the example above, the first vertex is at the origin (0,0), while the remaining vertices are listed in a clockwise direction. All vertices (pairs of X and Y coordinates) p0, p1, …, p4 are placed inside a list named points. This list is then passed to the polygon command to create the corresponding object.

Whether a variable has only a single value or it's a list of values, you can print its content on the console using the echo command.

**Code**

```openscad
…
echo(points);
…
```

The output in the console is: `[[0, 0], [0, 30], [15, 30], [35, 20], [35, 0]]`

Naming each point separately (p0, p1, …) is not required but it's recommended to better keep track of your design. You could also directly define the list of points to be passed to the polygon command.

**Code**

```openscad
…
points = [[0, 0], [0, 30], [15, 30], [35, 20], [35, 0]];
…
```

Moreover, you don't even have to define a variable to store the list of points. You can directly define the list of points when calling the polygon command.

**Code**

```openscad
…
polygon([[0, 0], [0, 30], [15, 30], [35, 20], [35, 0]]);
…
```

The above practices are not recommended. Instead the use of additional variables as in the first example is encouraged in order to make your scripts more readable and extendable.

You could also parameterize the definition of the points' coordinates according to the given dimensions, which will give you the ability to rapidly modify the dimensions of your object. This can be achieved by introducing one variable for each given dimension and by defining the coordinates of the points using appropriate mathematical expressions.

**Code** — `profile_1_polygon_parametric.scad`

```openscad
// Given dimensions
d1 = 15;
d2 = 20;
h1 = 20;
h2 = 10;
// Points
p0 = [0, 0];
p1 = [0, h1 + h2];
p2 = [d1, h1 + h2];
p3 = [d1 + d2, h1];
p4 = [d1 + d2, 0];
points = [p0, p1, p2, p3, p4];
// Polygon
polygon(points);
```

### Exercise

Create the following 2D object using the polygon primitive. To do this you will need to define a list that contains the pairs of X and Y coordinates of the object's points. Remember that the points should be defined in an appropriate order. You should first store the coordinates of each point on separate variables named p0, p1, p2, … and then define a list of all points and store it in a variable named points. This list will be passed on the polygon command. The definition of each point's coordinates should be parametric in relation to the given dimensions which can be achieved by using appropriate mathematical expressions. To do this you will also need to define a variable for each given dimension.

**Code** — [Expand]

### Exercise

Using the linear_extrude and rotate_extrude commands create a tube and a ring respectively that have the above profile. The tube should have a height of 100 units. The ring should have an inner diameter of 100 units. How many units do you need to translate the 2d profile along the positive direction of the X axis to achieve this?

**Code** — [Expand]

**Code** — [Expand]

It's time to use your new skills to create UwU racing car!

### Exercise

Create the above car body using the polygon command. To do so you will have to define each point of the design, add them all on a list and pass this list to the polygon command. The definition of each point's coordinates should be parametric in relation to the given dimensions. Remember that in order to do this you will have to define a variable for each given dimension and calculate each point's coordinates from these variables using appropriate mathematical expressions. You should extrude the created 2D profile to a height of 14 units.

**Code** — [Expand]

### Exercise

As mentioned previously, you can use additional variables to increase the readability of your script and to avoid repeating mathematical operations. Can you find a way to do so in the above script?

**Code** — [Expand]

### Exercise

Try completing the racing car design by adding the remaining objects to the above body.

**Code** — [Expand]

## Creating more complex object using the polygon primitive and math

From the above examples it should be quite obvious that the polygon primitive opens up possibilities to create objects that would hardly be possible by just using the fundamental 2D or 3D primitives. In these examples you created custom 2D profiles by defining the coordinates of their points according to a given design. To unlock the true power of the polygon command though, and to create even more complex and impressive designs, you have to programmatically define the points of your profiles using math. This is because defining each point separately is not scalable to the hundreds of points that are required to design smooth non-square profiles. One example of this is the following heart. Can you manually define the required points to create it? There is no way.

Instead of manually defining each point, which would be practically impossible, this model was programmatically defined using the following parametric equations.

x = 16·sin(t)³

y = 13·cos(t) − 5·cos(2·t) − 2·cos(3·t) − cos(4·t)

When the range of the t variable covers values from 0 to 360 degrees, the above equations give the X and Y coordinates for the outline of the heart, starting from the top middle point and moving in a clockwise direction. Using the above equations, a list that contains each point's coordinates can be generated in the following way.

**Code**

```openscad
points = [ for (t=[0:step:359.999]) [16*pow(sin(t),3), 13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t)]];
```

There are a few things you should notice about the syntax of list generation. First the name of the variable where the list will be stored is typed out. Then follows the equal sign (as in every variable assignment) and a pair of square brackets. Inside the pair of square brackets, the first thing that is typed out is the keyword for. After the keyword for follows a pair of parentheses inside of which the consecutive values that the corresponding variable is going to take are defined. This variable is similar to the for loop variable encountered in for loops. The number of elements that the generated list is going to have is equal to the number of values that this variable is going to take. For every value that this variable takes, one element of the list is defined. What each element of the list is going to be, is specified after the closing parenthesis. In this case each element of the generated list is itself a list that has two elements, one for each coordinate of the corresponding point. The t variable goes from 0 to 360 which is the required range to produce the whole outline of the heart. Since the polygon shouldn't include duplicate points, 359.999 is used instead of 360. By choosing a smaller or bigger value for the step variable, the amount of points that will be created can be controlled. Specifically, in order to create n points the step variable needs to be defined in the following way.

**Code**

```openscad
step = 360/n;
```

Putting all these together, the heart can be created with the following script.

**Code** — `heart.scad`

```openscad
n = 500;
h = 10;
step = 360/n;
points = [ for (t=[0:step:359.999]) [16*pow(sin(t),3), 13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t)]];
linear_extrude(height=h)
polygon(points);
```

You can see that by using 500 points the resolution of the outline is very good.

### Exercise

Modify the above script so that the outline of the heart is consisted out of 20 points.

**Code** — [Expand]

Using more or less points is up to you. If you want to create an object that closely resembles the underlying mathematical equations, you should increase the number of points. Instead, if you opt for a low poly style you should decrease the number of points.

### Exercise

Time for some quick list generation practice before you move on. Use the newly introduced syntax (`variable = [ for (i=[start:step:end]) … ];`) to generate the following lists:

i. `[1, 2, 3, 4, 5, 6]`

ii. `[10, 8, 6, 4, 2, 0, -2]`

iii. `[[3, 30], [4, 40], [5, 50], [6, 60]]`

**Solution for exercise i,** `[1, 2, 3, 4, 5, 6]`:

**Code** — [Expand]

**Solution for exercise ii,** `[10, 8, 6, 4, 2, 0, -2]`:

**Code** — [Expand]

**Solution for exercise iii,** `[[3, 30], [4, 40], [5, 50], [6, 60]]`:

**Code** — [Expand]

Note that when no step is provided, a default of 1 is used.

OpenSCAD also allows you to define your own mathematical functions, which can be useful when a mathematical expression is particularly long, or when you would like to use it multiple times. These functions work similarly to modules, except that instead of defining a design they define a mathematical process. After a function has been defined, you can use it by invoking its name and providing the necessary input parameters. For example, you can define a function that accepts the parameter t, and returns the X and Y coordinates of the corresponding point of the heart's outline.

**Code**

```openscad
function heart_coordinates(t) = [16*pow(sin(t),3), 13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t)];
```

In this case the script that creates the heart would take the following form.

**Code**

```openscad
n = 500;
h = 10;
step = 360/n;
function heart_coordinates(t) = [16*pow(sin(t),3), 13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t)];
points = [ for (t=[0:step:359.999]) heart_coordinates(t)];
linear_extrude(height=h)
polygon(points);
```

There are a few things you should notice about the definition of a function. First the word function is typed out. Then follows the name that you want to give to the function. In this case the function is named heart_coordinates. After the name of the function follows a pair of parentheses that contains the input parameters of the function. Like module parameters, the input parameters in a function can have default values. In this case, the only input parameter is the polar angle of the current step t and it's not given a default value. After the closing parenthesis follows the equal sign and the command that defines the pair of X and Y coordinates of the heart's outline.

The generation of the list of points can also be turned in a function. This can be done in a similar fashion as follows.

**Code**

```openscad
function heart_points(n=50) = [ for (t=[0:360/n:359.999]) heart_coordinates(t)];
```

In this case the script that creates the heart would take the following form.

**Code**

```openscad
n=20;
h = 10;
function heart_coordinates(t) = [16*pow(sin(t),3), 13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t)];
function heart_points(n=50) = [ for (t=[0:360/n:359.999]) heart_coordinates(t)];
points = heart_points(n=n);
linear_extrude(height=h)
polygon(points);
```

In short you should remember that any command that returns a single value or a list of values can be turned into a function. Like modules, functions should be used to organize your designs and make them reusable.

### Exercise

Since you have already defined the function for generating the list of points that is required to create a heart, it would be a good idea to also define a module that creates a heart. Create a module named heart. The module should have two input parameter h and n corresponding to the height of the heart and the number of points used. The module should call the heart_points function to create the required list of points and then pass that list to a polygon command to create the 2D profile of the heart. This profile should be extruded to the specified height.

**Code** — [Expand]

### Exercise

You can save the heart_coordinates and heart_points functions along with the heart module on a script named heart.scad and add it on your libraries. Every time you want to include a heart on a design that you are working on, you can use the use command to make the functions and modules of this script available to you.

You are going to put your new skills into practice to create an aerodynamic spoiler for your racing car!

## Another challenge

### Exercise

You are going to use a symmetrical 4-digit NACA 00xx airfoil for your spoiler. The half thickness of such an airfoil on a given point x is given by the following formula:

In the above formula, x is the position along the chord with 0 corresponding to the leading edge and 1 to the trailing edge, while t is the maximum thickness of the airfoil expressed as a percentage of the chord. Multiplying t by 100 gives the last two digits in the NACA 4-digit denomination.

Create a function named naca_half_thickness. The function should have two input parameters: x and t. Given x and t, the function should return the half thickness of the corresponding NACA airfoil. The x and t input parameters shouldn't have any default value.

**Code** — [Expand]

### Exercise

Create a function named naca_top_coordinates. This function should return a list of the X and Y coordinates for the top half of the airfoil. The first point should correspond to the leading edge while the last point should correspond to the trailing edge.

The function should have two input parameters: t and n. The parameter t should correspond to the airfoil's maximum thickness, while the parameter n should correspond to the number of created points. The list of points should be generated using an appropriate list generation command. You will need to call the naca_half_thickness function.

**Code** — [Expand]

### Exercise

Create a similar function named naca_bottom_coordinates that returns a list of points for the bottom half of the airfoil. This time the points should be given in reverse order. The first point should correspond to the trailing edge while the last point should correspond to the leading edge. This is done so that when the lists that are generated from the naca_top_coordinates and naca_bottom_coordinates functions are joined, all point of the airfoil are defined in a clockwise direction starting from the leading edge, thus making the resulting list suitable for use with the polygon command.

**Code** — [Expand]

### Exercise

Create a function named naca_coordinates that joins the two lists of points. You can use OpenSCAD's built in function "concat" to join lists together. Pass both lists as inputs to concat to join them together.

**Code** — [Expand]

### Exercise

Try using the naca_coordinates function to create a list that contains the points for an airfoil with a maximum thickness of 0.12 and with 300 points on each half. The list should be stored in a variable named points. The points variable should be passed to a polygon command to create the airfoils 2D profile.

**Code** — [Expand]

### Exercise

The chord of the above airfoil is 1 unit. Can you use an appropriate scale command to enlarge the airfoil? The desired chord should be defined on a variable named chord and the scale command should be defined in relation to this variable. Create an airfoil that has a chord of 20 units.

**Code** — [Expand]

### Exercise

Turn the above script into a module named naca_airfoil. The module should have three input parameter, chord, t and n. There shouldn't be default values for any of the input parameters.

**Code** — [Expand]

### Exercise

All you have to do now to create a wing out of the airfoil is to apply a linear_extrude command on the 2D airfoil profile. Create a module named naca_wing that does that. The naca_wing module should have two additional input parameters compared to the naca_airfoil module, span and center. The span parameter should correspond to the height of the extrusion while the center parameter should dictate whether the extrusion is executed along only the positive direction of the Z axis or along both directions. The span parameter shouldn't have a default value while the default value of the center parameter should be false. Can you use the naca_wing module to create the following wing? The following wing has a span of 50 units, while the airfoil of the wing has a chord of 20 units, a maximum thickness of 0.12 and 500 points on each half. You will have to additionally use a rotation transformation to place the wing as in the following image.

**Code** — [Expand]

### Exercise

Use the naca_wing module to add two smaller vertical wings on the previous example in order to create the spoiler of the car. The smaller wings should have a span of 15 units as well as a chord of 15 units.

**Code** — [Expand]

### Exercise

Add the above spoiler on the racing car design to complete it.

**Code** — [Expand]

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_Tutorial/Chapter_9&oldid=4443779"*


---

# Part II: OpenSCAD User Manual

OpenSCAD is software for creating solid 3D CAD objects.

It is [free software](https://www.gnu.org/philosophy/free-sw.html) and available for [GNU/Linux](https://www.gnu.org/), Microsoft Windows and Mac OS X.

Unlike most free software for creating 3D models (such as the well-known application Blender), OpenSCAD does not focus on the artistic aspects of 3D modelling, but instead focuses on the CAD aspects. So it might be the application you are looking for when you are planning to create 3D models of machine parts, but probably is not what you are looking for when you are more interested in creating computer-animated movies or organic life-like models.

OpenSCAD, unlike many CAD products, is not an interactive modeler. Instead it is something like a 2D/3D-compiler that reads in a program file that describes the object and renders the model from this file. This gives you (the designer) full control over the modelling process. This enables you to easily change any step in the modelling process and make designs that are defined by configurable parameters.

OpenSCAD has two main operating modes, Preview and Render. Preview is relatively fast using 3D graphics and the computer's GPU, but is an approximation of the model and can produce artifacts; Preview uses [OpenCSG](http://opencsg.org/) and OpenGL. Render generates exact geometry and a fully tessellated mesh. It is not an approximation and as such it is often a lengthy process, taking minutes or hours for larger designs. Render uses CGAL as its geometry engine.

OpenSCAD provides two types of 3D modelling:

- Constructive Solid Geometry (CSG)
- extrusion of 2D primitives into 3D space.

SVG is used for 2D while Autocad DXF files can be used as well for the data exchange format for 2D outlines. In addition to 2D paths for extrusion it is also possible to read design parameters from DXF files. Besides DXF files, OpenSCAD can read and create 3D models in the open 3mf, STL, OFF and many more file formats.

## Introduction

OpenSCAD can be downloaded from <https://www.openscad.org/>. More information is available on the [mailing list](https://www.openscad.org/community.html).

An interactive web version of OpenSCAD can be used to [play with an scad script](https://ochafik.com/openscad2/), is accepting (design) [contributions at git hub](https://github.com/openscad/openscad-playground), and is based on the [web version of the application](https://github.com/openscad/openscad/blob/master/README.md#building-for-webassembly).

A clear guided introduction to using OpenSCAD and to the OpenSCAD language is available in the [OpenSCAD Tutorial](https://en.wikibooks.org/wiki/OpenSCAD_Tutorial).

The [Mastering OpenSCAD website](https://mastering-openscad.eu/buch/introduction/) has a nice tutorial on the basics and offers a number of [complex examples](https://mastering-openscad.eu/buch/example_01/) to learn from.

For Teachers: a basic 25-slide presentation from 2014 is available under GNUFDL to walk your students through the process of using OpenSCAD here.

[Fablab Lannion](https://static.fablab-lannion.org/tutos/openscad/) (France) edited a nice French-language interactive tutorial that you might appreciate.

A "[cheat sheet](https://www.openscad.org/cheatsheet/)" is a useful quick reference for the OpenSCAD language, with each item linking back to this Wikibook.

A list of books can be found [here](http://openscad.org/documentation-books.html).

## Additional Resources

Periodically the two manuals below get cleaned up or have major transitions. Consider archiving the manuals prior to starting a major update. This can be done for the two 'printable version' links below to the [Internet Archive](https://archive.org)

- 2018-04-25 [The OpenSCAD User Manual - Print Version](https://web.archive.org/web/20180425002648/https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Print_version) & [The OpenSCAD Language - Print Version](https://web.archive.org/web/20180425001407/https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/The_OpenSCAD_Language)
- 2019-07-22 [The OpenSCAD User Manual](https://web.archive.org/web/20190722042509/https://en.wikibooks.org/wiki/OpenSCAD_User_Manual) Which includes links to the archives of the above two printed versions (as of this date).

## History

> A printable version of OpenSCAD User Manual is available. OpenSCAD\_User\_Manual ([edit it](https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Print_version&action=edit&preload=Template%3APrint+version%2FPreload))

The Wayback Machine no longer has a free user requested site archive, so below is just the two 'printable version' manuals

- 2020-12-11 [The OpenSCAD User Manual - Print Version](https://web.archive.org/web/20201211023636/https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Print_version) & [The OpenSCAD Language - Print Version](https://web.archive.org/web/20201211023916/https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/The_OpenSCAD_Language)

## The OpenSCAD User Manual — Table of Contents

1. Introduction
2. First Steps
3. The OpenSCAD User Interface
4. Input Devices
5. Customizer
6. Import - STL, 3MF, OFF, AMF, DXF, SVG, CSG
   1. SVG Import
7. Export - STL, 3MF, OFF, AMF, DXF, SVG, CSG, PNG
   1. STL Export
   2. CSG Export
   3. DXF Extrusion
   4. Other 2D formats
8. Example Projects
   1. Strandbeest
9. Paths
10. Using an external Editor with OpenSCAD
11. Integration with other applications
12. Using OpenSCAD in a command line environment
13. Building OpenSCAD from Sources
    1. Building on Linux/UNIX
    2. Cross-compiling for Windows on Linux or Mac OS X
    3. Building on Windows (Outdated)
    4. Building on Windows (New)
    5. Building on Mac OS X
    6. Submitting patches
14. Frequently Asked Questions
15. Libraries
16. Tips and Tricks
17. Command Glossary - Very short name and syntax reference

## The OpenSCAD Language Reference — Table of Contents

> A printable version of OpenSCAD User Manual is available. The\_OpenSCAD\_Language ([edit it](https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/The_OpenSCAD_Language&action=edit&preload=Template%3APrint+version%2FPreload))

1. The OpenSCAD Language
   1. General - READ THIS FIRST - comments, values and data types, variables, vectors, objects, getting input
   2. 3D objects -
      1. 3D Primitive Solids - cube, sphere, cylinder, polyhedron
      2. 3D to 2D Projection
   3. 2D Objects
      1. 2D Primitives - square, circle, polygon
      2. Text - Generate text using installed or user supplied font files; functions to retrieve text metrics.
      3. 2D to 3D - linear\_extrude, rotate\_extrude
   4. Transform
      1. color
      2. rotate, translate, mirror, multmatrix
      3. scale, resize
      4. offset, minkowski, hull
      5. Combining transformations
   5. Boolean combination
      1. union, difference, intersection, render
   6. Other Functions and Operators
      1. Conditional and Iterator Functions - for, intersection\_for, if, conditional ? :, assign, let
      2. Mathematical Operators - General, Vectors, Matrix multiplication
      3. Mathematical Functions
         1. Trigonometric (cos sin tan acos asin atan atan2)
         2. Other (abs ceil concat cross exp floor ln len let log lookup max min norm pow rands round sign sqrt)
      4. String Functions - str, chr, ord
      5. Type Test Functions - is\_undef, is\_bool, is\_num, is\_string, is\_list, is\_object
      6. List Comprehensions
      7. Other Language Features - Special '$' variables, echo, render, surface, search, version(), version\_num(), parent\_module(n) and $parent\_modules, assert
   7. User-Defined Functions and Modules - Functions, Modules, Children
   8. Debugging aids - % # ! * echo
   9. External libraries and code files
      1. include - SCAD, CSG
      2. use - SCAD
      3. import - STL, OFF, DXF
         1. import\_dxf - Deprecated
         2. import\_stl - Deprecated
      4. export - STL, OFF, AMF, 3MF, DXF, SVG, PNG, CSG
      5. surface - PNG

### Work in progress

This section contains documentation about ongoing work which is available as experimental features in snapshot versions of OpenSCAD or not yet integrated at all and pending in a [branch](https://github.com/openscad/openscad/branches) or [pull-request](https://github.com/openscad/openscad/pulls) at the [OpenSCAD github repository](https://github.com/openscad/openscad/).

---

# General

OpenSCAD is a 2D/3D and solid modeling program that is based on a Functional programming language used to create models that are previewed on the screen, and rendered into 3D mesh that can be exported in a variety of 2D/3D file formats.

## Introduction to Syntax

A script in the OpenSCAD language is used to create 2D or 3D models. This script is a free format list of statements, e.g.:

```
variable = value;
object();
operator() object();
operator() {
  variable = value;
  object();
}
operator() operator() {
  object();
  object();
}
operator() {
  operator() object();
  operator() {
    object();
    object();
  }
}
```

### Assignments

Assignment statements associate a value with a name.

### Objects

Objects are the building blocks for models, created by 2D and 3D primitives and user-defined modules. Objects end in a semicolon ';'.

Examples are: `cube()`, `sphere()`, `polygon()`, `circle()`, etc.

### Operators

Operators, or transformations, modify the location, color and other properties of objects. Operators use braces '{}' when their scope covers more than one action. More than one operator may be used for the same object or group of objects. Multiple operators are processed Right to Left, that is, the operator closest to the object is processed first.

Examples:

```openscad
cube(5);
x = 4+y;
rotate(40) square(5,10);
translate([10,5]) {
  circle(5);
  square(4);
}
rotate(60) color("red") {
  circle(5);
  square(4);
}
color("blue") {
  translate([5,3,0]) sphere(5);
  rotate([45,0,45]) {
    cylinder(10);
    cube([5,6,7]);
  }
}
```

## Comments

Comments are a way of leaving notes within the script, or code, (either to yourself or to future programmers) describing how the code works, or what it does. Comments are not evaluated by the compiler, and should not be used to describe self-evident code.

OpenSCAD uses C++-style comments:

```openscad
// This is a comment

myvar = 10; // The rest of the line is a comment

/*
  Multi-line comments
  can span multiple lines.
*/
```

## Values and Data Types

A value in OpenSCAD is either a Number (like 42), a Boolean (like true), a String (like "foo"), a Range (like \[0: 1: 10\]), a Vector (like \[1,2,3\]), or the Undefined value (undef). Values can be stored in variables, passed as function arguments, and returned as function results.

\[OpenSCAD is a dynamically typed language with a fixed set of data types. There are no type names, and no user defined types.\]

### Numbers

Numbers are the most important type of value in OpenSCAD, and they are written in the familiar decimal notation used in other languages, e.g., -1, 42, 0.5, 2.99792458e+8.

\[Note: Requires version Development snapshot\] Hexadecimal constants are allowed in the C style, 0x followed by hexadecimal digits.

\[OpenSCAD does not support octal notation for numbers.\]

In addition to decimal numerals, the following name for a special number is defined:

- `PI`

OpenSCAD has only a single kind of number, which is a 64 bit IEEE floating point number. OpenSCAD does not distinguish integers and floating point numbers as two different types, nor does it support complex numbers. Because OpenSCAD uses the IEEE floating point standard, there are a few deviations from the behavior of numbers in mathematics:

- We use binary floating point. A fractional number is not represented exactly unless the denominator is a power of 2. For example, 0.2 (2/10) does not have an exact internal representation, but 0.25 (1/4) and 0.375 (3/8) are represented exactly.
- The largest representable number is about 1e308. If a numeric result is too large, then the result can be infinity (printed as `inf` by echo).
- The smallest representable number is about -1e308. If a numeric result is too small, then the result can be -infinity (printed as `-inf` by echo).
- Values are precise to about 16 decimal digits.
- If a numeric result is invalid, then the result can be Not A Number (printed as `nan` by echo).
- If a non-zero numeric result is too close to zero to be representable, then the result is -0 if the result is negative, otherwise it is 0. Zero (0) and negative zero (-0) are treated as two distinct numbers by some of the math operations, and are printed differently by 'echo', although they compare as equal.

The constants `inf` and `nan` are not supported as numeric constants by OpenSCAD, even though you can compute numbers that are printed this way by 'echo'. You can define variables with these values by using:

```openscad
inf = 1e200 * 1e200;
nan = 0 / 0;
echo(inf,nan);
```

The value `nan` is the only OpenSCAD value that is not equal to any other value, including itself. Although you can test if a variable 'x' has the undefined value using `x == undef`, you can't use `x == 0/0` to test if x is Not A Number. Instead, you must use `x != x` to test if x is nan.

### Boolean values

Booleans are variables with two states, typically denoted in OpenSCAD as `true` and `false`. Boolean variables are typically generated by conditional tests and are employed by conditional statement `if()`. conditional operator `? :`, and generated by logical operators `!` (not), `&&` (and), and `||` (or).

Statements such as `if()` actually accept non-boolean variables, but most values are converted to `true` in a boolean context. The values that count as false are:

- `false`
- `0` and `-0`
- `""`
- `[]`
- `undef`

Note that `"false"` (the string), `[0]` (a numeric vector), `[ [] ]` (a vector containing an empty vector), `[false]` (a vector containing the Boolean value false) and `0/0` (not a number) all count as true.

### Strings

A string is a sequence of zero or more unicode characters. String values are used to specify file names when importing a file, and to display text for debugging purposes when using `echo()`. Strings can also be used with the `text()` primitive, added in version 2015.03.

A string literal is written as a sequence of characters enclosed in quotation marks `"`, like this: `""` (an empty string), or `"this is a string"`.

To include a `"` character in a string literal, use `\"`. To include a `\` character in a string literal, use `\\`. The following escape sequences beginning with `\` can be used within string literals:

| Escape Sequence | Result |
|---|---|
| `\"` | `"` |
| `\\` | `\` |
| `\t` | tab |
| `\n` | newline |
| `\r` | carriage return |
| `\x21` | `!` - valid only in the range from `\x01` to `\x7f`, `\x00` produces a space |
| `\u03a9` | Ω - 4 digit unicode code point, see `text()` for further information on unicode characters |
| `\U01f600` | 😀 - 6 digit unicode code point |

This behavior is new since OpenSCAD-2011.04. You can upgrade old files using the following sed command: `sed 's/\\/\\\\/g' non-escaped.scad > escaped.scad`

Example:

```openscad
echo("The quick brown fox \tjumps \"over\" the lazy dog.\rThe quick brown fox.\nThe \\lazy\\ dog.");
```

result

```
ECHO: "The quick brown fox 	jumps "over" the lazy dog.
The quick brown fox.
The \lazy\ dog."
```

old result

```
ECHO: "The quick brown fox \tjumps \"over\" the lazy dog.
The quick brown fox.\nThe \\lazy\\ dog."
```

### Ranges

Ranges are used by `for()` loops and `children()`. They have 2 varieties:

```
[<start>:<end>]
[<start>:<increment>:<end>]
```

A missing `<increment>` defaults to 1.

Although enclosed in square brackets `[]`, they are not vectors. They use colons `:` for separators rather than commas.

```openscad
r1 = [0:10];
r2 = [0.5:2.5:20];
echo(r1); // ECHO: [0: 1: 10]
echo(r2); // ECHO: [0.5: 2.5: 20]
```

In version 2021.01 and earlier, a range in the form `[<start>:<end>]` with `<start>` greater than `<end>` generates a warning and is equivalent to `[<end>: 1: <start>]`.

A range in the form `[<start>:1:<end>]` with `<start>` greater than `<end>` does not generate a warning and is equivalent to `[]`. \[Note: Requires version Development snapshot\] This also applies when the increment is omitted.

The `<increment>` in a range may be negative (for versions after 2014). A start value less than the end value, with a negative increment, does not generate a warning and is equivalent to `[]`.

You should take care with step values that cannot be represented exactly as binary floating point numbers. Integers are okay, as are fractional values whose denominator is a power of two. For example, 0.25 (1/4) and 0.375 (3/8) are safe, but 0.2 (2/10) may cause problems. The problem with these step values is that your range may have more or fewer elements than you expect, due to inexact arithmetic.

### The Undefined Value

The undefined value is a special value written as `undef`. It is the initial value of a variable that hasn't been assigned a value, and it is often returned as a result by functions or operations that are passed illegal arguments. Finally, `undef` can be used as a null value, equivalent to `null` or `NULL` in other programming languages.

All arithmetic expressions containing undef values evaluate as undef. In logical expressions, undef is equivalent to false. Relational operator expressions with undef evaluate as false except for `undef==undef`, which is true.

Note that numeric operations may also return 'nan' (not-a-number) to indicate an illegal argument. For example, `0/false` is `undef`, but `0/0` is 'nan'. Relational operators like `<` and `>` return false if passed illegal arguments. Although `undef` is a language value, 'nan' is not.

## Variables

OpenSCAD variables are created by a statement with a name or identifier, assignment via an expression and a semicolon. The role of arrays, found in many imperative languages, is handled in OpenSCAD via vectors. Valid identifiers are composed of simple characters and underscores `[a-zA-Z0-9_]`. High\_ASCII and Unicode characters are not allowed.

Before Development snapshot, variable names can begin with digits. In Development snapshot, names starting with `0x` and followed by hexadecimal digits represent a hexadecimal constant, and other variable names beginning with digits will trigger a warning.

```openscad
var = 25;
xx = 1.25 * cos(50);
y = 2*xx+var;
logic = true;
MyString = "This is a string";
a_vector = [1,2,3];
rr = a_vector[2];      // member of vector
range1 = [-1.5:0.5:3]; // for() loop range
xx = [0:5];             // alternate for() loop range
```

OpenSCAD is a Functional programming language, so such variables are bound to expressions and keep a single value during their entire lifetime due to the requirements of referential transparency. In imperative languages, such as C, the same behavior is seen as constants, which are typically contrasted with normal variables.

In other words, OpenSCAD variables are more like constants, but with an important difference. If variables are assigned a value multiple times, only the last assigned value is used in all places in the code. See further discussion at [Variables cannot be changed](#variables-cannot-be-changed). This behavior is due to the need to supply variable input on the command line, via the use of `-D variable=value` option. OpenSCAD currently places that assignment at the end of the source code, and thus must allow a variable's value to be changed for this purpose.

Values cannot be modified during run time; all variables are effectively constants that do not change once created. Each variable retains its last assigned value, in line with Functional programming languages. Unlike Imperative languages, such as C, OpenSCAD is not an iterative language, and therefore the concept of `x = x + 1` is not valid. The only way an expression like this works in OpenSCAD is if the `x` on the right comes from a parent scope, such as an argument list, and the assignment operation creates a new `x` in the current scope. Understanding this concept leads to understanding the beauty of OpenSCAD.

Before version 2015.03, it was not possible to do assignments at any place except the file top-level and module top-level. Inside an `if`/`else` or `for` loop, `assign()` was needed.

Since version 2015.03, variables can now be assigned in any scope. Note that assignments are valid only within the scope in which they are defined - it is still not possible to leak values to an outer scope. See Scope of variables for more details.

```openscad
a=0;
if (a==0)
{
  a=1; // before 2015.03 this line would generate a Compile Error
       // since 2015.03 no longer an error, but the value a=1 is confined to within the braces {}
}
```

### Undefined variable

Referring to a variable that has not had a value assigned triggers a warning, and yields the special value `undef`.

It is possible to detect an undefined variable using `is_undef(var)`. (Note that the simpler `var == undef` will yield a warning.)

Example

```openscad
echo("Variable a is ", a);        // Variable a is undef, triggers a warning
if (is_undef(a)) {                // does not trigger a warning
  echo("Variable a is tested undefined"); // Variable a is tested undefined
}
```

### Scope of variables

When operators such as `translate()` and `color()` need to encompass more than one action (actions end in `;`), braces `{}` are needed to group the actions, creating a new, inner scope. When there is only one semicolon, braces are usually optional.

Each pair of braces grouping "children" of an operator creates a new scope inside the scope where they were used. Since 2015.03, new variables can be created within this new scope. New values can be given to variables that were created in an outer scope. These variables and their values are also available to further inner scopes created within this scope, but are not available to anything outside this scope. Variables still have only the last value assigned within a scope.

```openscad
// scope 1
a = 6;             // create a
echo(a,b);         //   6, undef
translate([5,0,0]){ // scope 1.1
  a= 10;
  b= 16;           // create b
  echo(a,b);       //   100, 16  a=10; was overridden by later a=100;
  color("blue") {  // scope 1.1.1
    echo(a,b);     //   100, 20
    cube();
    b=20;
  }                // back to 1.1
  echo(a,b);       //   100, 16
  a=100;           // override a in 1.1
}                  // back to 1
echo(a,b);         //   6, undef
color("red"){      // scope 1.2
  cube();
  echo(a,b);       //   6, undef
}                  // back to 1
echo(a,b);         //   6, undef
//In this example, scopes 1 and 1.1 are outer scopes to 1.1.1 but 1.2 is not.
```

Anonymous scopes are not considered scopes:

```openscad
{
  angle = 45;
}
rotate(angle) square(10);
```

For() loops are not an exception to the rule about variables having only one value within a scope. A copy of loop contents is created for each pass. Each pass is given its own scope, allowing any variables to have unique values for that pass. No, you still can't do `a = a + 1`.

### Variables cannot be changed

The simplest description of OpenSCAD variables is that an assignment creates a new variable in the current scope, and that it's not legal to set a variable that has already been set in the current scope. In a lot of ways, it's best to think of them as named constants, calculated on entry to the scope, but there's a catch. If you set a variable twice in the same scope, the second assignment triggers a warning (which may abort the program, depending on preferences settings). It does \*not\* then replace the value of the variable - rather, it replaces the original assignment, at its position in the list of assignments. The original assignment is never executed.

```openscad
a = 1; // never executed
echo(a); // 2
a = 2; // executed at the position of the original assignment
echo(a); // 2
```

That's still not the complete story. There are two special cases that do not trigger warnings:

- if the first assignment is in the top level of an `include` file, and the second assignment is in the including file.
- If the first assignment is in the top level of the program source, and the second assignment comes from a `-D` option or from the Customizer.

While this appears to be counter-intuitive, it allows you to do some interesting things: for instance, if you set up your shared library files to have default values defined as variables at their root level, when you include that file in your own code you can 're-define' or override those constants by simply assigning a new value to them - and other variables based on that variable are based on the value from the main program.

```openscad
// main.scad
include <lib.scad>
a = 2;
echo(b);

// lib.scad
a = 1;
b = a + 1;
```

will produce `3`.

### Special variables

Special variables provide an alternate means of passing arguments to modules and functions. All variables starting with a `$` are special variables, similar to special variables in lisp. As such they are more dynamic than regular variables. (for more details see Other Language Features)

## Vectors

A vector or list is a sequence of zero or more OpenSCAD values. Vectors are collections of numeric or boolean values, variables, vectors, strings or any combination thereof. They can also be expressions that evaluate to one of these. Vectors handle the role of arrays found in many imperative languages. The information here also applies to lists and tables that use vectors for their data.

A vector has square brackets, `[]` enclosing zero or more items (elements or members), separated by commas. A vector can contain vectors, which can contain vectors, etc.

Examples

```openscad
[1,2,3]
[a,5,b]
[]
[5.643]
["a","b","string"]
[[1,r],[x,y,z,4,5]]
[3, 5, [6,7], [[8,9],[10,[11,12],13], c, "string"]
[4/3, 6*1.5, cos(60)]
```

use in OpenSCAD:

```openscad
cube( [width,depth,height] );           // optional spaces shown for clarity
translate( [x,y,z] )
polygon( [ [x0,y0], [x1,y1], [x2,y2] ] );
```

### Creation

Vectors are created by writing the list of elements, separated by commas, and enclosed in square brackets. Variables are replaced by their values.

```openscad
cube([10,15,20]);
a1 = [1,2,3];
a2 = [4,5];
a3 = [6,7,8,9];
b = [a1,a2,a3]; // [ [1,2,3], [4,5], [6,7,8,9] ] note increased nesting depth
```

Vectors can be initialized using a for loop enclosed in square brackets.

The following example initializes the vector result with a length n of 10 values to the value of a.

```openscad
n = 10;
a = 0;
result = [ for (i=[0:n-1]) a ];
echo(result); //ECHO: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
```

The following example shows a vector result with a n length of 10 initialized with values that are alternatively a or b respectively if the index position i is an even or an odd number.

```openscad
n = 10;
a = 0;
b = 1;
result = [ for (i=[0:n-1]) (i % 2 == 0) ? a : b ];
echo(result); //ECHO: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
```

### Indexing elements within vectors

Elements within vectors are numbered from 0 to n - 1 where n is the length returned by `len()`. Address elements within vectors with the following notation:

```
e[5]           // element no 5 (sixth) at 1st nesting level
e[5][2]        // element 2 of element 5    2nd nesting level
e[5][2][0]     // element 0 of 2 of 5       3rd nesting level
e[5][2][0][1]  // element 1 of 0 of 2 of 5  4th nesting level
```

example elements with lengths from `len()`

```openscad
e = [ [1], [], [3,4,5], "string", "x", [[10,11],[12,13,14],[[15,16],[17]]] ]; // length 6
```

| address | length | element |
|---|---|---|
| `e[0]` | 1 | `[1]` |
| `e[1]` | 0 | `[]` |
| `e[5]` | 3 | `[ [10,11], [12,13,14], [[15,16],[17]] ]` |
| `e[5][1]` | 3 | `[ 12, 13, 14 ]` |
| `e[5][2]` | 2 | `[ [15,16], [17] ]` |
| `e[5][2][0]` | 2 | `[ 15, 16 ]` |
| `e[5][2][0][1]` | undef | `16` |
| `e[3]` | 6 | `"string"` |
| `e[3][2]` | 1 | `"r"` |
| `s = [2,0,5]; a = 2;` | | |
| `s[a]` | undef | `5` |
| `e[s[a]]` | 3 | `[ [10,11], [12,13,14], [[15,16],[17]] ]` |

### String indexing

The elements (characters) of a string can be accessed:

```openscad
"string"[2] //resolves to "r"
```

### Dot notation indexing

The first three elements of a vector can be accessed with an alternate dot notation:

```openscad
e.x //equivalent to e[0]
e.y //equivalent to e[1]
e.z //equivalent to e[2]
```

### Vector operators

#### concat

\[Note: Requires version 2015.03\]

`concat()` combines the elements of 2 or more vectors into a single vector. No change in nesting level is made.

```openscad
vector1 = [1,2,3]; vector2 = [4]; vector3 = [5,6];
new_vector = concat(vector1, vector2, vector3); // [1,2,3,4,5,6]

string_vector = concat("abc","def");                // ["abc", "def"]
one_string = str(string_vector[0],string_vector[1]); // "abcdef"
```

#### len

`len()` is a function that returns the length of vectors or strings. Indices of elements are from `[0]` to `[length-1]`.

**vector**

Returns the number of elements at this level.

Single values, which are not vectors, raise an error.

**string**

Returns the number of characters in a string.

```openscad
a = [1,2,3]; echo(len(a)); // 3
```

See example elements with lengths

### Matrix

A matrix is a vector of vectors.

Example that defines a 2D rotation matrix

```openscad
mr = [
  [cos(angle), -sin(angle)],
  [sin(angle),  cos(angle)]
];
```

## Objects

\[Note: Requires version Development snapshot\]

Objects store collections of data, like vectors, but the individual members are accessed by string names rather than by numeric indexes. They are analogous to JavaScript objects or Python dictionaries.

### Creating an object

The `object()` function can be used to create objects. `object()` processes its arguments left to right, adding them to the object under construction. It accepts three different styles of argument, which can be mixed as desired:

The first form is this:

```
<name>=<value>
```

This form is convenient for cases where the name is constant and suitable for use as an identifier.

The second form is this:

```
[
  [ <name-string>, <value> ],
  ...
]
```

This form allows calculated names and names that are not suitable as identifiers. It also allows lists of members that are derived from other processing - from a list comprehension, perhaps.

The third form is this:

```
<object>
```

If an argument is itself an object, its members are added to the object under construction.

If a member is mentioned more than once, the last mention wins. Thus you can copy an object, replacing one member, using `object(obj, name=newvalue)`.

You can remove a member from the object under construction using the list form, supplying only a name and no value - e.g., `object(obj, [ [ "unwanted" ] ])`

### Retrieving a value from an object

```
obj.name
```

Retrieves the named value from the object, for a name that is constant and syntactically suitable for use as an identifier.

```
obj["name"]
```

Retrieves the named value from the object, for a name that is an arbitrary string expression.

Note that members with identifier-like names can be accessed using either mechanism. The choice depends on the particular use case.

If the specified member is not present in the object, yields `undef`.

### Iterating over object members

```openscad
for (name = obj) { ... }
```

iterates over the members of the object, in an unspecified order, setting `name` to the name of each member. It is then typically desirable to access the value using `obj[name]`.

This construct works for flow-control `for`, `intersection_for()`, and list-comprehension `for`.

### Examples

```openscad
// Create an object with a few members.
o1 = object(a = 1, b = "hello", c = true);

// Retrieve a member using a constant name.
echo(o1.b);       // "hello"

// Retrieve members using a name that varies.
for (k = [ "a", "b" ])
  echo(o1[k]); // 1; "hello"

// Copy the object, changing "c", adding "d", and removing "a".
o2 = object(o1, c = false, d = "dog", "a");
echo(o2);         // { b = "hello"; c = false; d = "dog"; }

// Create an object, calculating the names to use.
o3 = object([
  for (i = [1:3])
    [ str("x", i), i*i ]
]);
echo(o3);         // { x1 = 1; x2 = 4; x3 = 9; }

// Merge the three objects together.
o4 = object(o1, o2, o3);

// Separately print each member of the result
for (name = o4)
  echo(name = name, value = o4[name]);
  // name = "a", value = 1
  // name = "b", value = "hello"
  // name = "c", value = false
  // name = "d", value = "dog"
  // name = "x1", value = 1
  // name = "x2", value = 4
  // name = "x3", value = 9
```

## Getting input

There is no mechanism for variable input from keyboard or reading from arbitrary files. There is no prompting mechanism, no input window, or input fields or any way to manually enter data while the script is running.

Variables can be set via:

- assignments in the script
- the Customizer
- `-D` at the command line interface
- accessing data in a few file formats (stl, dxf, png, etc).

With the exception of DXF files, data from files is not accessible to the script, although to a limited extent the script may be able to manipulate the data as a whole. For example, STL files can be rendered in OpenSCAD, translated, clipped, etc. But the internal data that constitutes the STL file is inaccessible.

### Getting a point from a drawing

Getting a point is useful for reading an origin point in a 2D view in a technical drawing. The function `dxf_cross` reads the intersection of two lines on a layer you specify and returns the intersection point. This means that the point must be given with two lines in the DXF file, and not a point entity.

```openscad
OriginPoint = dxf_cross(file="drawing.dxf", layer="SCAD.Origin",
                         origin=[0, 0], scale=1);
```

### Getting a dimension value

You can read dimensions from a technical drawing. This can be useful to read a rotation angle, an extrusion height, or spacing between parts. In the drawing, create a dimension that does not show the dimension value, but an identifier. To read the value, you specify this identifier from your program:

```openscad
TotalWidth = dxf_dim(file="drawing.dxf", name="TotalWidth",
                      layer="SCAD.Origin", origin=[0, 0], scale=1);
```

For a nice example of both functions, see Example009 and the image on the [homepage of OpenSCAD](http://www.openscad.org/).

---

# First Steps

Creating your first model after installing OpenSCAD.

1. Creating a simple model
2. Positioning an object
3. Changing the color of an object
4. Model views
5. Opening an existing example model

**Notes:**

1. For information about downloading and installing OpenSCAD, see <http://www.openscad.org/downloads.html>.

---

# The OpenSCAD User Interface

The User Interface (UI) has the usual menus along the top of the Window; File, Edit, View, Window, and Help to which is added the Design Menu. The application starts with three sections, or panes, showing in the window:

1. The Model Viewing Pane
2. The Console Pane
3. A Text Editor Tab

The rest of the sections in the UI may be shown by enabling them using the Window Menu.

> **Note:** In the following sections menu items that have hot keys defined show the key press in parentheses, as in Design > Preview (F5)

## User Interface

Each pane of the UI may be moved, extracted to its own window, and closed using the icons on the pane's header.

## Window Panes Common Features

Click and Drag in the header bar to move a pane to any edge of the window and it will dock to that side, if there is already another pane docked there the one being dragged will become a tabbed window with the existing one.

Clicking the double window icon makes the pane into a separate window and the X icon, of course, closes it.

## Model Viewing Pane

The model generated by the script is previewed in the viewing area and, optionally, will be automatically updated with each change in the script. This pane is actually the main window for the application so it has the menu bar permanently and the other panes dock at its edges.

The preview may be manually refreshed using menu Design > Preview (F5). To see the fully rendered model Design > Render (F6) may be used.

The View menu has several options for showing or hiding features of the Viewing Pane. For example, the Show Axes (Ctrl+2) menu item shows an indicator for the coordinate axes can be enabled.

More information about the Model View Icon-bar functions is available.

### Navigation

The view of the model is manipulated using the mouse and specific keys:

| Action | Operation | Description |
|---|---|---|
| Centre of Rotation | double Left Click | click on an axis line, or the surface of a model to set |
| | Ctrl+3 | Show Crosshair |
| rotating the view | Left Click and Drag | up and down tilts the view up and down. Side to side spins the view around the Z-axis. |
| | Left Double-click | to set the centre of rotation. |
| | Shift + Left Click and Drag | side to side rotates the view around an axis from the origin to the view point. Up and down work as Left Click and Drag |
| moving the viewing area | Right Click and Drag | moves the viewing area, left, right, up, and down |
| zooming | Rolling the mouse wheel | (if available) |
| | Shift + Middle Click and Drag | up and down zooms |
| | Shift + Right Click and Drag | up and down zooms |
| | Plus and Minus keys | + and - |
| | Square Brackets | Ctrl + \[ and Ctrl + \] |
| Reset Rotation | Ctrl + 0 | short cut to menu View > Diagonal |
| Reset All | Ctrl + Shift + 0 | short cut to menu View > Center |

## Console Output Pane

This pane is where status information about graphics processing, and feedback messages from a running script are displayed.

During rendering a progress-bar is displayed at the bottom of the console, along with a button to cancel it.

## Text Editor Tabs

Each open script file is shown in its own tab in the text editor pane.

It has the standard features:

- text search & replace
- syntax highlighting
- comment / un-comment lines of text
- file reload to revert all edits in a session
- color schemes (selected in Preferences)
- code/text snippet insertion (templates)
- font size control
- interactive number modifications

### Editor Templates

The editor has a facility for pasting in blocks of text or snippets of code to assist when writing code. These text items are called Templates and are inserted into the script at the cursor position. Right Mouse click to see the context action menu, select the Insert Template item, and then double click template you want.

Templates are simple JSON files with a single top level definition. For example, a template for if-then-else could be:

```json
{
  "key" : "if-then-else",
  "content" : "if(^~^) \n\t;\nelse\n\t;"
}
```

Note the special symbol, `^~^`, in the template. That marks where to leave the text cursor after it is pasted in. This is what it will look like:

```
if()
	;
else
	;
```

with the text cursor between the parentheses, just after "if", ready to put in the conditional expression.

Using and creating templates is covered in more depth on the UI Advanced Features page.

### Font Size Control

When hovering over an editor tab, or floating window, rolling the mouse wheel, while holding the Control Key down, will increase, or decrease the font size, effectively zooming in and out.

Zooming in and out in the Model View Pane is done the same way.

### Interactive Number Modifications

When the cursor to the right of a digit in a number it can be incremented or decremented using the arrow keys or by rolling the mouse wheel.

right adjacent to a digit:

- Alt + Down Arrow — decrement
- Alt + Up Arrow — increment

The left and right arrows also have a role in interactive change:

left of a number:

- Alt + Left Arrow — to add digits to the left

right of a number:

- Alt + Right Arrow — will add a decimal point and one fraction digit per tap

Further details on Interactive Modification are covered on the Advanced Page.

## Animation Control Pane

The Animate option adds an animation bar to the lower edge of the screen. As soon as FPS and Steps are set (reasonable values to begin with are 10 and 100, respectively), the current Time is incremented by 1/Steps, FPS times per second, until it reaches 1, when it wraps back to 0.

Every time Time is changed, the program is re-evaluated with the variable `$t` set to the current time. Read more about how `$t` is used in section Other\_Language\_Features.

A more complete description of Animation is on the Advanced UI page.

## The Rest of the UI Elements

- Fonts List Pane
- Customizer Pane
- Viewport Control


---

# OpenSCAD User Manual — Primitive Solids, 2D Primitives, and Text

---

## Part 1: Primitive Solids

### cube

Creates a cube or rectangular prism (i.e., a "box") in the first octant. When center is true, the cube is centered on the origin. Argument names are optional if given in the order shown here.

```openscad
cube(size = [x,y,z], center = true/false);
cube(size =  x    ,  center = true/false);
```

**Parameters:**

- **size**
  - single value, cube with all sides this length
  - 3 value array `[x,y,z]`, rectangular prism with dimensions x, y and z.
- **center**
  - `false` (default), 1st (positive) octant, one corner at (0,0,0)
  - `true`, cube is centered at (0,0,0)

**default values:** `cube();` yields: `cube(size = [1, 1, 1], center = false);`

**Examples:**

equivalent scripts for this example

```openscad
cube(size = 18);
cube(18);
cube([18,18,18]);
cube(18,false);
cube([18,18,18],false);
cube([18,18,18],center=false);
cube(size = [18,18,18], center = false);
cube(center = false,size = [18,18,18] );
```

equivalent scripts for this example

```openscad
cube([18,28,8],true);
box=[18,28,8];cube(box,true);
```

---

### sphere

Creates a sphere at the origin of the coordinate system. The `r` argument name is optional. To use `d` instead of `r`, `d` must be named.

**Parameters**

- **r** — Radius. This is the radius of the sphere.
- **d** — Diameter. This is the diameter of the sphere.

The resolution of the sphere is based on the size of the sphere and the `$fa`, `$fs` and `$fn` variables. For more information on these special variables see Circle resolution: `$fa`, `$fs`, and `$fn`.

**default values:** `sphere();` yields: `sphere($fn = 0, $fa = 12, $fs = 2, r = 1);`

**Usage Examples**

```openscad
sphere(r = 1);
sphere(r = 5);
sphere(r = 10);
sphere(d = 2);
sphere(d = 10);
sphere(d = 20);
```

```openscad
// this creates a high resolution sphere with a 2mm radius
sphere(2, $fn=100);

// also creates a 2mm high resolution sphere but this one
// does not have as many small triangles on the poles of the sphere
sphere(2, $fa=5, $fs=0.1);
```

---

### cylinder

Creates a cylinder or cone centered about the z axis. When center is true, it is also centered vertically along the z axis.

Parameter names are optional if given in the order shown here. If a parameter is named, all following parameters must also be named.

```openscad
cylinder(h = height, r1 = BottomRadius, r2 = TopRadius, center = true/false);
```

**NOTES:**

The 2nd & 3rd positional parameters are `r1` & `r2`, if `r`, `d`, `d1` or `d2` are used they must be named.

Using `r1` & `r2` or `d1` & `d2` with either value of zero will make a cone shape, a non-zero non-equal value will produce a section of a cone (a Conical Frustum). `r1` & `d1` define the base width, at `[0,0,0]`, and `r2` & `d2` define the top width.

**Parameters**

- **h** : height of the cylinder or cone
- **r** : radius of cylinder. r1 = r2 = r.
- **r1** : radius, bottom of cone.
- **r2** : radius, top of cone.
- **d** : diameter of cylinder. r1 = r2 = d / 2. \[Note: Requires version 2014.03\]
- **d1** : diameter, bottom of cone. r1 = d1 / 2. \[Note: Requires version 2014.03\]
- **d2** : diameter, top of cone. r2 = d2 / 2. \[Note: Requires version 2014.03\]
- **center**
  - `false` (default), z ranges from 0 to h
  - `true`, z ranges from -h/2 to +h/2

The resolution of a cylinder is based on its radius and the `$fa`, `$fs` and `$fn` variables. For a cone, the resolution is based on the radius of the larger end. For more information on these special variables see Circle resolution: `$fa`, `$fs`, and `$fn`.

**defaults:** `cylinder();` yields: `cylinder($fn = 0, $fa = 12, $fs = 2, h = 1, r1 = 1, r2 = 1, center = false);`

**equivalent scripts**

```openscad
cylinder(h=15, r1=9.5, r2=19.5, center=false);
cylinder( 15,    9.5,    19.5,   false);
cylinder( 15,    9.5,    19.5);
cylinder( 15,    9.5, d2=39 );
cylinder( 15, d1=19,  d2=39 );
cylinder( 15, d1=19,  r2=19.5);
```

**equivalent scripts**

```openscad
cylinder(h=15, r1=10, r2=0, center=true);
cylinder( 15,    10,    0,   true);
cylinder(h=15, d1=20, d2=0, center=true);
```

center = false | center = true

**equivalent scripts**

```openscad
cylinder(h=20, r=10, center=true);
cylinder( 20,   10,   10,true);
cylinder( 20, d=20, center=true);
cylinder( 20,r1=10, d2=20, center=true);
cylinder( 20,r1=10, d2=2*10, center=true);
```

#### use of $fn

Larger values of `$fn` create smoother, more circular, surfaces at the cost of longer rendering time. Some use medium values during development for the faster rendering, then change to a larger value for the final F6 rendering.

However, use of small values can produce some interesting non circular objects. A few examples are shown here:

**scripts for these examples**

```openscad
cylinder(20,20,20,$fn=3);
cylinder(20,20,00,$fn=4);
cylinder(20,20,10,$fn=4);
```

#### undersized holes

Using `cylinder()` with `difference()` to place holes in objects creates undersized holes. This is because circular paths are approximated with polygons inscribed within in a circle. The points of the polygon are on the circle, but straight lines between are inside. To have all of the hole larger than the true circle, the polygon must lie wholly outside of the circle (circumscribed). Modules for circumscribed holes

**script for this example**

```openscad
poly_n = 6;
color("blue")   translate([0, 0, 0.02]) linear_extrude(0.1) circle(10, $fn=poly_n);
color("green")  translate([0, 0, 0.01]) linear_extrude(0.1) circle(10, $fn=360);
color("purple") linear_extrude(0.1) circle(10/cos(180/poly_n), $fn=poly_n);
```

In general, a polygon of radius has a radius to the midpoint of any side as `r·cos(180/n)`. If only the midpoint radius is known (for example, to fit a hex key into a hexagonal hole), then the polygon radius is `r/cos(180/n)`.

---

### polyhedron

A polyhedron is the most general 3D primitive solid. It can be used to create any regular or irregular shape including those with concave as well as convex features. Curved surfaces are approximated by a series of flat surfaces.

```openscad
polyhedron( points = [ [X0, Y0, Z0], [X1, Y1, Z1], ... ], triangles = [ [P0, P1, P2], ... ], convexity = N);   // before 2014.03
polyhedron( points = [ [X0, Y0, Z0], [X1, Y1, Z1], ... ], faces = [ [P0, P1, P2, P3, ...], ... ], convexity = N); // 2014.03 & later
```

**Parameters**

- **points**
  Vector of 3d points or vertices. Each point is in turn a vector, `[x,y,z]`, of its coordinates.
  Points may be defined in any order. N points are referenced, in the order defined, as 0 to N-1.

- **triangles** \[Deprecated: triangles is deprecated and will be removed in a future release. Use faces parameter instead.\]
  Vector of faces that collectively enclose the solid. Each face is a vector containing the indices (0 based) of 3 points from the points vector.

- **faces** \[Note: Requires version 2014.03\]
  Vector of faces that collectively enclose the solid. Each face is a vector containing the indices (0 based) of 3 or more points from the points vector.
  Faces may be defined in any order, but the points of each face must be ordered correctly (see below). Define enough faces to fully enclose the solid, with no overlap.
  If points that describe a single face are not on the same plane, the face is automatically split into triangles as needed.

- **convexity**
  Integer. The convexity parameter specifies the maximum number of faces a ray intersecting the object might penetrate. This parameter is needed only for correct display of the object in OpenCSG preview mode. It has no effect on the polyhedron rendering. For display problems, setting it to 10 should work fine for most cases.

**default values:** `polyhedron();` yields: `polyhedron(points = undef, faces = undef, convexity = 1);`

#### Face Ordering

In the list of faces, for each face it is arbitrary which point you start with, but the points of the face (referenced by the index into the list of points) must be ordered in clockwise direction when looking at each face from outside inward. The back is viewed from the back, the bottom from the bottom, etc.

Another way to remember this ordering requirement is to use the **left-hand rule**. Using your left hand, stick your thumb up and curl your fingers as if giving the thumbs-up sign, point your thumb away from the face, and order the points in the direction your fingers curl (this is the opposite of the STL file format convention, which uses a "right-hand rule"). Try this on the example below.

#### Example 1: Using polyhedron to generate cube( [ 10, 7, 5 ] );

point numbers for cube | unfolded cube faces

```openscad
CubePoints = [
  [  0,  0,  0 ],  //0
  [ 10,  0,  0 ],  //1
  [ 10,  7,  0 ],  //2
  [  0,  7,  0 ],  //3
  [  0,  0,  5 ],  //4
  [ 10,  0,  5 ],  //5
  [ 10,  7,  5 ],  //6
  [  0,  7,  5 ]]; //7

CubeFaces = [
  [0,1,2,3],  // bottom
  [4,5,1,0],  // front
  [7,6,5,4],  // top
  [5,6,2,1],  // right
  [6,7,3,2],  // back
  [7,4,0,3]]; // left

polyhedron( CubePoints, CubeFaces );
```

**equivalent descriptions of the bottom face**

```openscad
[0,1,2,3],
[0,1,2,3,0],
[1,2,3,0],
[2,3,0,1],
[3,0,1,2],
[0,1,2],[2,3,0],   // 2 triangles with no overlap
[1,2,3],[3,0,1],
[1,2,3],[0,1,3],
```

#### Example 2: A square base pyramid

A simple polyhedron, square base pyramid

```openscad
polyhedron(
  points=[ [10,10,0],[10,-10,0],[-10,-10,0],[-10,10,0], // the four points at base
           [0,0,10]  ],                                  // the apex point
  faces=[ [0,1,4],[1,2,4],[2,3,4],[3,0,4],              // each triangle side
          [1,0,3],[2,1,3] ]                              // two triangles for square base
);
```

#### Example 3: A triangular prism

A polyhedron triangular prism; prism unfolded to show external faces

```openscad
module prism(l, w, h) {
  polyhedron(//            pt  0        1        2        3        4        5
             points=[[0,0,0], [0,w,h], [l,w,h], [l,0,0], [0,w,0], [l,w,0]],
             // top sloping face (A)
             faces=[[0,1,2,3],
                    // vertical rectangular face (B)
                    [2,1,4,5],
                    // bottom face (C)
                    [0,3,5,4],
                    // rear triangular face (D)
                    [0,4,1],
                    // front triangular face (E)
                    [3,2,5]]
  );
}

prism(10, 10, 5);
```

#### Manifold Conditions

Mistakes in defining polyhedra include not having all faces in clockwise order (viewed from outside - a bottom need to be viewed from below), overlap of faces and missing faces or portions of faces. As a general rule, the polyhedron faces should also satisfy manifold conditions:

- exactly two faces should meet at any polyhedron edge.
- if two faces have a vertex in common, they should be in the same cycle face-edge around the vertex.

The first rule eliminates polyhedra like two cubes with a common edge and not watertight models; the second excludes polyhedra like two cubes with a common vertex.

When viewed from the outside, the points describing each face must be in the same clockwise order, and provides a mechanism for detecting counterclockwise. When the thrown together view (F12) is used with F5, CCW faces are shown in pink. Reorder the points for incorrect faces. Rotate the object to view all faces. The pink view can be turned off with F10.

#### Debugging polyhedra

OpenSCAD allows, temporarily, commenting out part of the face descriptions so that only the remaining faces are displayed. Use `//` to comment out the rest of the line. Use `/*` and `*/` to start and end a comment block. This can be part of a line or extend over several lines. Viewing only part of the faces can be helpful in determining the right points for an individual face. Note that a solid is not shown, only the faces. If using F12, all faces have one pink side. Commenting some faces helps also to show any internal face.

```openscad
CubeFaces = [
/* [0,1,2,3],  // bottom
   [4,5,1,0],  // front */
   [7,6,5,4],  // top
/* [5,6,2,1],  // right
   [6,7,3,2],  // back */
   [7,4,0,3]]; // left
```

After defining a polyhedron, its preview may seem correct. The polyhedron alone may even render fine. However, to be sure it is a valid manifold and that it can generate a valid STL file, union it with any cube and render it (F6). If the polyhedron disappears, it means that it is not correct. Revise the winding order of all faces and the two rules stated above.

#### Example 4: A more complex polyhedron with mis-ordered faces

When you select 'Thrown together' from the view menu and compile (preview F5) the design (not compile and render!) the preview shows the mis-oriented polygons highlighted. Unfortunately this highlighting is not possible in the OpenCSG preview mode because it would interfere with the way the OpenCSG preview mode is implemented.)

Below you can see the code and the picture of such a problematic polyhedron, the bad polygons (faces or compositions of faces) are in pink.

**Mis-ordered faces**

```openscad
// Bad polyhedron
polyhedron
(points = [
  [0, -10, 60], [0, 10, 60], [0, 10, 0], [0, -10, 0], [60, -10, 60], [60, 10, 60],
  [10, -10, 50], [10, 10, 50], [10, 10, 30], [10, -10, 30], [30, -10, 50], [30, 10, 50]
],
faces = [
  [0,2,3],   [0,1,2],   [0,4,5],   [0,5,1],   [5,4,2],   [2,4,3],
  [6,8,9],   [6,7,8],   [6,10,11], [6,11,7],   [10,8,11],
  [10,9,8],  [0,3,9],   [9,0,6],   [10,6, 0],  [0,4,10],
  [3,9,10],  [3,10,4],  [1,7,11],  [1,11,5],   [1,7,8],
  [1,8,2],   [2,8,11],  [2,11,5]
]
);
```

**A correct polyhedron would be the following:**

**Beginner's tip:**

If you don't really understand "orientation", try to identify the mis-oriented pink faces and then invert the sequence of the references to the points vectors until you get it right. E.g. in the above example, the third triangle (`[0,4,5]`) was wrong and we fixed it as `[4,0,5]`. Remember that a face list is a circular list. In addition, you may select "Show Edges" from the "View Menu", print a screen capture and number both the points and the faces.

```openscad
polyhedron
(points = [
  [0, -10, 60], [0, 10, 60], [0, 10, 0], [0, -10, 0], [60, -10, 60], [60, 10, 60],
  [10, -10, 50], [10, 10, 50], [10, 10, 30], [10, -10, 30], [30, -10, 50], [30, 10, 50]
],
faces = [
  [0,3,2],   [0,2,1],   [4,0,5],   [5,0,1],   [5,2,4],   [4,2,3],
  [6,8,9],   [6,7,8],   [6,10,11], [6,11,7],   [10,8,11],
  [10,9,8],  [3,0,9],   [9,0,6],   [10,6, 0],  [0,4,10],
  [3,9,10],  [3,10,4],  [1,7,11],  [1,11,5],   [1,8,7],
  [2,8,1],   [8,2,11],  [5,11,2]
]
);
```

In our example, the points are annotated in black and the faces in blue. Turn the object around and make a second copy from the back if needed. This way you can keep track.

#### Clockwise technique

Orientation is determined by clockwise circular indexing. This means that if you're looking at the triangle (in this case `[4,0,5]`) from the outside you'll see that the path is clockwise around the center of the face. The winding order `[4,0,5]` is clockwise and therefore good. The winding order `[0,4,5]` is counter-clockwise and therefore bad. Likewise, any other clockwise order of `[4,0,5]` works: `[5,4,0]` & `[0,5,4]` are good too. If you use the clockwise technique, you'll always have your faces outside (outside of OpenSCAD, other programs do use counter-clockwise as the outside though).

Think of it as a **"left hand rule"**:

If you place your left hand on the face with your fingers curled in the direction of the order of the points, your thumb should point outward. If your thumb points inward, you need to reverse the winding order.

#### Succinct description of a 'Polyhedron'

- **Points** define all of the points/vertices in the shape.
- **Faces** is a list of polygons that connect up the points/vertices.
- Each point, in the point list, is defined with a 3-tuple x,y,z position specification. Points in the point list are automatically enumerated starting from zero for use in the faces list (0,1,2,3,... etc).
- Each face, in the faces list, is defined by selecting 3 or more of the points (using the point order number) out of the point list.
  - e.g. `faces=[ [0,1,2] ]` defines a triangle from the first point (points are zero referenced) to the second point and then to the third point.
- When looking at any face from the outside, the face must list all points in a clockwise order.

#### Point repetitions in a polyhedron point list

The point list of the polyhedron definition may have repetitions. When two or more points have the same coordinates they are considered the same polyhedron vertex. So, the following polyhedron:

```openscad
points = [[ 0, 0, 0], [10, 0, 0], [ 0,10, 0],
          [ 0, 0, 0], [10, 0, 0], [ 0,10, 0],
          [ 0,10, 0], [10, 0, 0], [ 0, 0,10],
          [ 0, 0, 0], [ 0, 0,10], [10, 0, 0],
          [ 0, 0, 0], [ 0,10, 0], [ 0, 0,10]];

polyhedron(points, [[0,1,2], [3,4,5], [6,7,8], [9,10,11], [12,13,14]]);
```

define the same tetrahedron as:

```openscad
points = [[0,0,0], [0,10,0], [10,0,0], [0,0,10]];

polyhedron(points, [[0,2,1], [0,1,3], [1,2,3], [0,3,2]]);
```

---

## Part 2: 2D Primitives

All 2D primitives can be transformed with 3D transformations. They are usually used as part of a 3D extrusion. Although they are infinitely thin, they are rendered with a 1-unit thickness.

> **Note:** Trying to subtract with `difference()` from 3D object will lead to unexpected results in final rendering.

### square

Creates a square or rectangle in the first quadrant. When center is true the square is centered on the origin. Argument names are optional if given in the order shown here.

```openscad
square(size = [x, y], center = true/false);
square(size =  x   , center = true/false);
```

**Parameters:**

- **size**
  - single value, square with both sides this length
  - 2 value array `[x,y]`, rectangle with dimensions x and y
- **center**
  - `false` (default), 1st (positive) quadrant, one corner at (0,0)
  - `true`, square is centered at (0,0)

**default values:** `square();` yields: `square(size = [1, 1], center = false);`

**Examples:**

equivalent scripts for this example

```openscad
square(size = 10);
square(10);
square([10,10]);
square(10,false);
square([10,10],false);
square([10,10],center=false);
square(size = [10, 10], center = false);
square(center = false,size = [10, 10] );
```

equivalent scripts for this example

```openscad
square([20,10],true);
a=[20,10];square(a,true);
```

---

### circle

Creates a circle at the origin. All parameters, except `r`, must be named.

```openscad
circle(r=radius | d=diameter);
```

**Parameters**

- **r** : circle radius. `r` name is the only one optional with circle.
  circle resolution is based on size, using `$fa` or `$fs`.
  For a small, high resolution circle you can make a large circle, then scale it down, or you could set `$fn` or other special variables.
  Note: These examples exceed the resolution of a 3d printer as well as of the display screen.

```openscad
scale([1/100, 1/100, 1/100]) circle(200); // create a high resolution circle with a radius of 2.
circle(2, $fn=50);                         // Another way.
```

- **d** : circle diameter (only available in versions later than 2014.03).
- **$fa** : minimum angle (in degrees) of each fragment.
- **$fs** : minimum circumferential length of each fragment.
- **$fn** : fixed number of fragments in 360 degrees. Values of 3 or more override `$fa` and `$fs`.

If they are used, `$fa`, `$fs` and `$fn` must be named parameters. click here for more details,.

**defaults:** `circle();` yields: `circle($fn = 0, $fa = 12, $fs = 2, r = 1);`

Equivalent scripts for this example

```openscad
circle(10);
circle(r=10);
circle(d=20);
circle(d=2+9*2);
```

---

### Ellipses

An ellipse can be created from a circle by using either `scale()` or `resize()` to make the x and y dimensions unequal. See OpenSCAD User Manual/Transformations

equivalent scripts for this example

```openscad
resize([30,10])circle(d=20);
scale([1.5,.5])circle(d=20);
```

---

### Regular Polygons

A regular polygon of 3 or more sides can be created by using `circle()` with `$fn` set to the number of sides. The following two pieces of code are equivalent.

```openscad
circle(r=1, $fn=4);
```

```openscad
module regular_polygon(order = 4, r=1){
  angles=[ for (i = [0:order-1]) i*(360/order) ];
  coords=[ for (th=angles) [r*cos(th), r*sin(th)] ];
  polygon(coords);
}
regular_polygon();
```

These result in the following shapes, where the polygon is inscribed within the circle with all sides (and angles) equal. One corner points to the positive x direction. For irregular shapes see the polygon primitive below.

**script for these examples**

```openscad
translate([-42,  0]){circle(20,$fn=3);%circle(20,$fn=90);}
translate([  0,  0]) circle(20,$fn=4);
translate([ 42,  0]) circle(20,$fn=5);
translate([-42,-42]) circle(20,$fn=6);
translate([  0,-42]) circle(20,$fn=8);
translate([ 42,-42]) circle(20,$fn=12);

color("black"){
  translate([-42,  0,1])text("3",7,,center);
  translate([  0,  0,1])text("4",7,,center);
  translate([ 42,  0,1])text("5",7,,center);
  translate([-42,-42,1])text("6",7,,center);
  translate([  0,-42,1])text("8",7,,center);
  translate([ 42,-42,1])text("12",7,,center);
}
```

---

### polygon

Creates a multiple sided shape from a list of x,y coordinates. A polygon is the most powerful 2D object. It can create anything that circle and squares can, as well as much more. This includes irregular shapes with both concave and convex edges. In addition it can place holes within that shape.

```openscad
polygon(points = [ [x, y], ... ], paths = [ [p1, p2, p3..], ...], convexity = N);
```

**Parameters**

- **points**
  The list of x,y points of the polygon. : A vector of 2 element vectors.
  Note: points are indexed from 0 to n-1.

- **paths**
  - **default** — If no path is specified, all points are used in the order listed.
  - **single vector** — The order to traverse the points. Uses indices from 0 to n-1. May be in a different order and use all or part, of the points listed.
  - **multiple vectors** — Creates primary and secondary shapes. Secondary shapes are subtracted from the primary shape (like `difference()`). Secondary shapes may be wholly or partially within the primary shape.
  - A closed shape is created by returning from the last point specified to the first.

- **convexity**
  Integer number of "inward" curves, ie. expected path crossings of an arbitrary line through the polygon. See below.

**defaults:** `polygon();` yields: `polygon(points = undef, paths = undef, convexity = 1);`

#### Without holes

equivalent scripts for this example

```openscad
polygon(points=[[0,0],[100,0],[130,50],[30,50]]);
polygon([[0,0],[100,0],[130,50],[30,50]], paths=[[0,1,2,3]]);
polygon([[0,0],[100,0],[130,50],[30,50]],[[3,2,1,0]]);
polygon([[0,0],[100,0],[130,50],[30,50]],[[1,0,3,2]]);

a=[[0,0],[100,0],[130,50],[30,50]];
b=[[3,0,1,2]];
polygon(a);
polygon(a,b);
polygon(a,[[2,3,0,1,2]]);
```

#### One hole

equivalent scripts for this example

```openscad
polygon(points=[[0,0],[100,0],[0,100],[10,10],[80,10],[10,80]], paths=[[0,1,2],[3,4,5]],convexity=10);

triangle_points =[[0,0],[100,0],[0,100],[10,10],[80,10],[10,80]];
triangle_paths =[[0,1,2],[3,4,5]];
polygon(triangle_points,triangle_paths,10);
```

The 1st path vector, `[0,1,2]`, selects the points, `[0,0],[100,0],[0,100]`, for the primary shape. The 2nd path vector, `[3,4,5]`, selects the points, `[10,10],[80,10],[10,80]`, for the secondary shape. The secondary shape is subtracted from the primary ( think `difference()` ). Since the secondary is wholly within the primary, it leaves a shape with a hole.

#### Multi hole

\[Note: Requires version 2015.03\] (for use of `concat()`)

```openscad
//example polygon with multiple holes
a0 = [[0,0],[100,0],[130,50],[30,50]];       // main
b0 = [1,0,3,2];
a1 = [[20,20],[40,20],[30,30]];              // hole 1
b1 = [4,5,6];
a2 = [[50,20],[60,20],[40,30]];              // hole 2
b2 = [7,8,9];
a3 = [[65,10],[80,10],[80,40],[65,40]];      // hole 3
b3 = [10,11,12,13];
a4 = [[98,10],[115,40],[85,40],[85,10]];     // hole 4
b4 = [14,15,16,17];
a  = concat (a0,a1,a2,a3,a4);
b  = [b0,b1,b2,b3,b4];
polygon(a,b);
//alternate
polygon(a,[b0,b1,b2,b3,b4]);
```

#### Extruding a 3D shape from a polygon

```openscad
translate([0,-20,10]) {
  rotate([90,180,90]) {
    linear_extrude(50) {
      polygon(
        points = [
          //x,y
          /*
             O .
          */
          [-2.8,0],
          /*
             O__X .
          */
          [-7.8,0],
          /*
             O
              \
              X__X .
          */
          [-15.3633,10.30],
          /*
             X_______._____O
              \
              X__X .
          */
          [15.3633,10.30],
          /*
             X_______._______X
              \               /
              X__X .      O
          */
          [7.8,0],
          /*
             X_______._______X
              \               /
              X__X . O__X
          */
          [2.8,0],
          /*
             X__________.__________X
              \                   /
              \        O        /
                \      / /
                  \    / /
                  X__X . X__X
          */
          [5.48858,5.3],
          /*
             X__________.__________X
              \                   /
              \ O__________X    /
                \      / /
                  \    / /
                  X__X . X__X
          */
          [-5.48858,5.3],
        ]
      );
    }
  }
}
```

#### convexity

The convexity parameter specifies the maximum number of front sides (back sides) a ray intersecting the object might penetrate. This parameter is needed only for correct display of the object in OpenCSG preview mode and has no effect on the polyhedron rendering.

This image shows a 2D shape with a convexity of 2, as the ray indicated in red crosses the 2D shapes outside⇒inside (or inside⇒outside) a maximum of 2 times. The convexity of a 3D shape would be determined in a similar way. Setting it to 10 should work fine for most cases.

---

### import_dxf

\[Deprecated: `import_dxf()` is deprecated and will be removed in a future release. Use `import()` instead.\]

Read a DXF file and create a 2D shape.

**Example**

```openscad
linear_extrude(height = 5, center = true, convexity = 10)
    import_dxf(file = "example009.dxf", layer = "plate");
```

---

## Part 3: Text

The `text` module creates text as a 2D geometric object, using fonts installed on the local system or provided as separate font file.

\[Note: Requires version 2015.03\]

### Parameters

- **text**
  String. The text to generate.

- **size**
  Decimal. The generated text has an ascent (height above the baseline) of approximately this value. Default is 10. Fonts vary and may be a different height, typically slightly smaller. The formula to convert the size value to "points" is `pt = size * 3.937`, so a size argument of 3.05 will give about 12pt text, for instance. Note: if you know a point is 1/72" this may not look right, but point measurements of text are the distance from ascent to descent, not from ascent to baseline as in this case.

- **font**
  String. The name of the font that should be used. This is not the name of the font file, but the logical font name (internally handled by the fontconfig library). This can also include a style parameter, see below. A list of installed fonts & styles can be obtained using the font list dialog (Help -> Font List).

- **direction**
  String. Direction of the text flow. Possible values are `"ltr"` (left-to-right), `"rtl"` (right-to-left), `"ttb"` (top-to-bottom) and `"btt"` (bottom-to-top). Default is `"ltr"`.

- **language**
  String. The language of the text (e.g., `"en"`, `"ar"`, `"ch"`). Default is `"en"`.

- **script**
  String. The script of the text (e.g., `"latin"`, `"arabic"`, `"hani"`). Default is `"latin"`.

- **halign**
  String. The horizontal alignment for the text. Possible values are `"left"`, `"center"` and `"right"`. Default is `"left"`.

- **valign**
  String. The vertical alignment for the text. Possible values are `"top"`, `"center"`, `"baseline"` and `"bottom"`. Default is `"baseline"`.

- **spacing**
  Decimal. Factor to increase/decrease the character spacing. The default value of 1 results in the normal spacing for the font, giving a value greater than 1 causes the letters to be spaced further apart.

- **$fn**
  used for subdividing the curved path segments provided by freetype

### Example

```openscad
text("OpenSCAD");
```

### Notes

To allow specification of particular Unicode characters, you can specify them in a string with the following escape codes;

| Escape Code | Description |
|---|---|
| `\x03` | hex char-value (only hex values from 01 to 7f are supported) |
| `\u0123` | Unicode char with 4 hexadecimal digits (note: lowercase `\u`) |
| `\U012345` | Unicode char with 6 hexadecimal digits (note: uppercase `\U`) |

The null character (NUL) is mapped to the space character (SP).

```openscad
assert(version() == [2019, 5, 0]);
assert(ord(" ") == 32);
assert(ord("\x00") == 32);
assert(ord("\u0000") == 32);
assert(ord("\U000000") == 32);
```

**Example**

```openscad
t="\u20AC10 \u263A";  // 10 euro and a smilie
```

---

### Using Fonts & Styles

Fonts are specified by their logical font name; in addition a style parameter can be added to select a specific font style like "bold" or "italic", such as:

```
font="Liberation Sans:style=Bold Italic"
```

The font list dialog (available under Help > Font List) shows the font name and the font style for each available font. For reference, the dialog also displays the location of the font file. You can drag a font in the font list, into the editor window to use in the `text()` statement.

OpenSCAD includes the fonts **Liberation Mono**, **Liberation Sans**, and **Liberation Serif**. Hence, as fonts in general differ by platform type, use of these included fonts is likely to be portable across platforms.

For common/casual text usage, the specification of one of these fonts is recommended for this reason. Liberation Sans is the default font to encourage this.

In addition to the installed fonts (for windows only fonts installed as admin for all users), it's possible to add project specific font files. Supported font file formats are TrueType Fonts (*.ttf) and OpenType Fonts (*.otf). The files need to be registered with `use<>`.

```openscad
use <ttf/paratype-serif/PTF55F.ttf>
```

After the registration, the font is listed in the font list dialog, so in case logical name of a font is unknown, it can be looked up as it was registered.

OpenSCAD uses fontconfig to find and manage fonts, so it's possible to list the system configured fonts on command line using the fontconfig tools in a format similar to the GUI dialog.

```bash
$ fc-list -f "%-60{{%{family[0]}%{:style[0]=}}}%{file}\n" | sort
```

```
...
Liberation Mono:style=Bold Italic  /usr/share/fonts/truetype/liberation2/LiberationMono-BoldItalic.ttf
Liberation Mono:style=Bold         /usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf
Liberation Mono:style=Italic       /usr/share/fonts/truetype/liberation2/LiberationMono-Italic.ttf
Liberation Mono:style=Regular      /usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf
...
```

Under Windows, fonts are stored in the Windows Registry. To get a file with the font file names, use the command:

```cmd
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts" /s > List_Fonts_Windows.txt
```

**Example**

```openscad
square(10);

translate([15, 15]) {
  text("OpenSCAD", font = "Liberation Sans");
}

translate([15, 0]) {
  text("OpenSCAD", font = "Liberation Sans:style=Bold Italic");
}
```

---

### Alignment

#### Vertical alignment

- **top**
  The text is aligned so the top of the tallest character in your text is at the given Y coordinate.

- **center**
  The text is aligned with the center of the bounding box at the given Y coordinate. This bounding box is based on the actual sizes of the letters, so taller letters and descenders will affect the positioning.

- **baseline**
  The text is aligned with the font baseline at the given Y coordinate. This is the default, and is the only option that makes different pieces of text align vertically, as if they were written on lined paper, regardless of character heights and descenders.

- **bottom**
  The text is aligned so the bottom of the lowest-reaching character in your text is at the given Y coordinate.

```openscad
text = "Align";
font = "Liberation Sans";

valign = [
  [  0, "top"],
  [ 40, "center"],
  [ 75, "baseline"],
  [110, "bottom"]
];

for (a = valign) {
  translate([10, 120 - a[0], 0]) {
    color("red") cube([135, 1, 0.1]);
    color("blue") cube([1, 20, 0.1]);
    linear_extrude(height = 0.5) {
      text(text = str(text,"_",a[1]), font = font, size = 20, valign = a[1]);
    }
  }
}
```

The `text()` module doesn't support multi-line text, but you can make a separate call for each line, using `translate()` to space them. A spacing of `1.4*size` is the minimum required to prevent lines overlapping (if they include descenders). `1.6*size` is approximately the default single-spacing in many word processing programs. To get evenly spaced lines, use `"baseline"` vertical alignment; otherwise, lines may be lower or higher depending on their contents.

#### Horizontal alignment

- **left**
  The text is aligned with the left side of the bounding box at the given X coordinate. This is the default.

- **center**
  The text is aligned with the center of the bounding box at the given X coordinate.

- **right**
  The text is aligned with the right of the bounding box at the given X coordinate.

```openscad
text = "Align";
font = "Liberation Sans";

halign = [
  [10, "left"],
  [50, "center"],
  [90, "right"]
];

for (a = halign) {
  translate([140, a[0], 0]) {
    color("red") cube([115, 2, 0.1]);
    color("blue") cube([2, 20, 0.1]);
    linear_extrude(height = 0.5) {
      text(text = str(text,"_",a[1]), font = font, size = 20, halign = a[1]);
    }
  }
}
```

---

### 3D text

Text can be changed from a 2 dimensional object into a 3D object by using `linear_extrude`.

```openscad
//3d Text Example
linear_extrude(4)
  text("Text");
```

---

### Metrics

\[Note: Requires version Development snapshot\]

#### textmetrics()

The `textmetrics()` function accepts the same parameters as `text()`, and returns an object describing how the text would be rendered.

The returned object has these members:

- **position**: the position of the lower-left corner of the generated text.
- **size**: the size of the generated text.
- **ascent**: the amount that the text extends above the baseline.
- **descent**: the amount that the text extends below the baseline.
- **offset**: the origin of the text after aligning. Text typically starts slightly right of this point.
- **advance**: the "other end" of the text, the point at which additional text should be positioned, relative to "offset". Text generally ends slightly left of this point.

```openscad
s = "Hello, World!";
size = 20;
font = "Liberation Serif";

tm = textmetrics(s, size=size, font=font);
echo(tm);

translate([0,0,1]) text("Hello, World!", size=size, font=font);
color("black") translate(tm.position) square(tm.size);
```

yields (reformatted for readability):

```
ECHO: {
  position = [0.7936, -4.2752];
  size = [149.306, 23.552];
  ascent = 19.2768;
  descent = -4.2752;
  offset = [0, 0];
  advance = [153.09, 0];
}
```

---

#### fontmetrics()

The `fontmetrics()` function accepts a font size and a font name, both optional, and returns an object describing global characteristics of the font.

**Parameters**

- **size**
  Decimal, optional. The size of the font, as described above for `text()`.

- **font**
  String, optional. The name of the font, as described above for `text()`.

Note that omitting the size and/or font may be useful to get information about the default font.

**Returns an object:**

- **nominal**: usual dimensions for a glyph:
  - **ascent**: height above the baseline
  - **descent**: depth below the baseline
- **max**: maximum dimensions for a glyph:
  - **ascent**: height above the baseline
  - **descent**: depth below the baseline
- **interline**: design distance from one baseline to the next
- **font**: identification information about the font:
  - **family**: the font family name
  - **style**: the style (Regular, Italic, et cetera)

```openscad
echo(fontmetrics(font="Liberation Serif"));
```

yields (reformatted for readability):

```
ECHO: {
  nominal = {
    ascent = 12.3766;
    descent = -3.0043;
  };
  max = {
    ascent = 13.6312;
    descent = -4.2114;
  };
  interline = 15.9709;
  font = {
    family = "Liberation Serif";
    style = "Regular";
  };
}
```


---

# OpenSCAD User Manual/Transformations

Transformations affect their child nodes and as the name implies transform them in various ways such as moving, rotating or scaling the child.

Transformations are written before the object they affect e.g.

Notice that there is no semicolon following transformation command. Transformations can be applied to a group of child nodes by using '{' and '}' to enclose the subtree e.g.

Cascading transformations are used to apply a variety of transforms to a final child. Cascading is achieved by nesting statements e.g.

Combining transformations is a sequential process, going from right to left. Consider the following two transformations:

While these contain the same operations, the first rotates a cube around the origin and then moves it by the offset specified for the translate, before finally coloring it red. By contrast, the second sequence first moves a cube, and then rotates it around the origin, before coloring it green. In this case the rotation causes the cube to move along an arc centered at the origin. The radius of this arc is the distance from the origin, which was set by the preceding translation. The different ordering of the rotate and translate transformations causes the cubes to end up in different places.

## Basic concept

```openscad
translate([10,20,30])
  cube(10);
```

```openscad
translate([0,0,-5])
{
  cube(10);
  cylinder(r=5,h=10);
}
```

```openscad
rotate([45,45,45])
  translate([10,20,30])
    cube(10);
```

```openscad
color("red") translate([0,10,0]) rotate([45,0,0])   cube(5);
color("green") rotate([45,0,0])   translate([0,10,0]) cube(5);
```

> When combining transforms, order is important

### Advanced concept

As OpenSCAD uses different libraries to implement capabilities this can introduce some inconsistencies to the F5 preview behaviour of transformations. Traditional transforms (translate, rotate, scale, mirror & multimatrix) are performed using OpenGL in preview, while other more advanced transforms, such as resize, perform a CGAL operation, behaving like a CSG operation affecting the underlying object, not just transforming it. In particular this can affect the display of modifier characters, specifically "#" and "%", where the highlight may not display intuitively, such as highlighting the pre-resized object, but highlighting the post-scaled object.

---

## scale

Scales its child elements using the specified vector. Note that unlike the resize transformation below, this is multiplicative, so the current size is multiplied by the factor provided in the vector. The argument name is optional.

**Usage Example:**

```openscad
scale(v = [x, y, z]) { ... }
```

```openscad
cube(10);
translate([15,0,0]) scale([0.5,1,2]) cube(10);
```

---

## resize

Modifies the size of the child object to match the given x, y, and z sizes.

resize() is a CGAL operation, and like others such as render() operates with full geometry, so even in preview this takes time to process.

**Usage Example:**

If x, y, or z is 0 then that dimension is left as-is.

```openscad
// resize the sphere to extend 30 in x, 60 in y, and 10 in the z directions.
resize(newsize=[30,60,10]) sphere(r=10);
```

```openscad
// resize the 1x1x1 cube to 2x2x1
resize([2,2,0]) cube();
```

If the 'auto' parameter is set to true, it auto-scales any 0-dimensions to match. For example.

```openscad
// resize the 1x2x0.5 cube to 7x14x3.5
resize([7,0,0], auto=true) cube([1,2,0.5]);
```

The 'auto' parameter can also be used if you only wish to auto-scale a single dimension, and leave the other as-is.

```openscad
// resize to 10x8x1. Note that the z dimension is left alone.
resize([10,0,0], auto=[true,true,false]) cube([5,4,1]);
```

---

## rotate

Rotates its child 'a' degrees about the axis of the coordinate system or around an arbitrary axis. The argument names are optional if the arguments are given in the same order as specified.

**Usage:**

```openscad
rotate(a = deg_a, v = [x, y, z]) { ... }
// or
rotate(deg_a, [x, y, z]) { ... }
rotate(a = [deg_x, deg_y, deg_z]) { ... }
rotate([deg_x, deg_y, deg_z]) { ... }
```

The 'a' argument (deg_a) can be an array, as expressed in the later usage above; when deg_a is an array, the 'v' argument is ignored. Where 'a' specifies multiple axes then the rotation is applied in the following order: x then y then z. That means the code:

```openscad
rotate(a=[ax,ay,az]) {...}
```

is equivalent to:

```openscad
rotate(a=[0,0,az]) rotate(a=[0,ay,0]) rotate(a=[ax,0,0]) {...}
```

For example, to flip an object upside-down, you can rotate your object 180 degrees around the 'y' axis.

```openscad
rotate(a=[0,180,0]) { ... }
```

This is frequently simplified to

```openscad
rotate([0,180,0]) { ... }
```

The optional argument 'v' is a vector that determines an arbitrary axis about which the object is rotated.

When specifying a single axis the 'v' argument allows you to specify which axis is the basis for rotation. For example, the equivalent to the above, to rotate just around y

```openscad
rotate(a=180, v=[0,1,0]) { ... }
```

When specifying a single axis, 'v' is a vector defining an arbitrary axis for rotation; this is different from the multiple axis above. For example, rotate your object 45 degrees around the axis defined by the vector [1,1,0],

```openscad
rotate(a=45, v=[1,1,0]) { ... }
```

Rotate with a single scalar argument rotates around the Z axis. This is useful in 2D contexts where that is the only axis for rotation. For example:

```openscad
rotate(45) square(10);
```

### Right-hand grip rule

For the case of:

```openscad
rotate([a, b, c]) { ... };
```

- "a" is a rotation about the X axis, from the +Y axis, toward the +Z axis.
- "b" is a rotation about the Y axis, from the +Z axis, toward the +X axis.
- "c" is a rotation about the Z axis, from the +X axis, toward the +Y axis.

These are all cases of the Right Hand Rule. Point your right thumb along the positive axis, your fingers show the direction of rotation.

Thus if "a" is fixed to zero, and "b" and "c" are manipulated appropriately, this is the spherical coordinate system.

So, to construct a cylinder from the origin to some other point (x,y,z):

### Rotation rule help

```openscad
x= 10; y = 10; z = 10; // point coordinates of end of cylinder

length = norm([x,y,z]);  // radial distance
b = acos(z/length);      // inclination angle
c = atan2(y,x);          // azimuthal angle

rotate([0, b, c])
  cylinder(h=length, r=0.5);
%cube([x,y,z]); // corner of cube should coincide with end of cylinder
```

---

## translate

Translates (moves) its child elements along the specified vector. The argument name is optional.

```openscad
translate(v = [x, y, z]) { ... }
```

**Example:**

```openscad
cube(2,center = true);
translate([5,0,0])
  sphere(1,center = true);
```

---

## mirror

Transforms the child element to a mirror of the original, as if it were the mirror image seen through a plane intersecting the origin. The argument to mirror() is the normal vector of the origin-intersecting mirror plane used, meaning the vector coming perpendicularly out of the plane. Each coordinate of the original object is altered such that it becomes equidistant on the other side of this plane from the closest point on the plane. For example, `mirror([1,0,0])`, corresponding to a normal vector pointing in the x-axis direction, produces an object such that all positive x coordinates become negative x coordinates, and all negative x coordinates become positive x coordinates.

**Function signature:**

```openscad
mirror(v= [x, y, z] ) { ... }
```

The original is on the right side. Note that mirror doesn't make a copy. Like rotate and scale, it changes the object.

### Examples

```openscad
hand(); // original
mirror([1,0,0]) hand();
```

```openscad
hand(); // original
mirror([1,1,0]) hand();
```

```openscad
hand(); // original
mirror([1,1,1]) hand();
```

```openscad
// original
rotate([0,0,-30]){
  cube([23,12,10]);
  translate([0.5, 4.4, 9.9]){
    color("red", 1.0){
      linear_extrude(height=2){
        text("OpenSCAD", size= 3);
      }
    }
  }
}
// mirrored
mirror([1,0,0]){
  rotate([0,0,-30]){
    cube([23,12,10]);
    translate([0.5, 4.4, 9.9]){
      color("red", 1.0){
        linear_extrude(height=2){
          text("OpenSCAD", size= 3);
        }
      }
    }
  }
}
```

---

## multmatrix

Multiplies the geometry of all child elements with the given affine transformation matrix, where the matrix is 4×3 - a vector of 3 row vectors with 4 elements each, or a 4×4 matrix with the 4th row always forced to [0,0,0,1].

**Usage:** `multmatrix(m = [...]) { ... }`

This is a breakdown of what you can do with the independent elements in the matrix (for the first three rows):

| Scale X | Shear X along Y | Shear X along Z | Translate X |
|---------|-----------------|-----------------|-------------|
| Shear Y along X | Scale Y | Shear Y along Z | Translate Y |
| Shear Z along X | Shear Z along Y | Scale Z | Translate Z |

The fourth row is forced to [0,0,0,1] and can be omitted unless you are combining matrices before passing to multmatrix, as it is not processed in OpenSCAD. Each matrix operates on the points of the given geometry as if each vertex is a 4 element vector consisting of a 3D vector with an implicit 1 as its 4th element, such as v=[x, y, z, 1]. The role of the implicit fourth row of m is to preserve the implicit 1 in the 4th element of the vectors, permitting the translations to work. The operation of multmatrix therefore performs m*v for each vertex v. Any elements (other than the 4th row) not specified in m are treated as zeros.

This example rotates by 45 degrees in the XY plane and translates by [10,20,30], i.e. the same as `translate([10,20,30]) rotate([0,0,45])` would do.

```openscad
angle=45;
multmatrix(m = [ [cos(angle), -sin(angle), 0, 10],
                 [sin(angle),  cos(angle), 0, 20],
                 [         0,           0, 1, 30],
                 [         0,           0, 0,  1]
]) union() {
  cylinder(r=10.0,h=10,center=false);
  cube(size=[10,10,10],center=false);
}
```

The following example demonstrates combining affine transformation matrices by matrix multiplication, producing in the final version a transformation equivalent to `rotate([0, -35, 0]) translate([40, 0, 0]) Obj();`. Note that the signs on the sin function appear to be in a different order than the above example, because the positive one must be ordered as x into y, y into z, z into x for the rotation angles to correspond to rotation about the other axis in a right-handed coordinate system.

```openscad
module Obj() {
  cylinder(r=10.0,h=10,center=false);
  cube(size=[10,10,10],center=false);
}

// This iterates into the future 6 times and demonstrates how multimatrix is moving the object around the center point
for(time = [0 : 15 : 90]){
  y_ang=-time;
  mrot_y = [ [ cos(y_ang), 0, sin(y_ang), 0],
             [          0, 1,          0, 0],
             [-sin(y_ang), 0, cos(y_ang), 0],
             [          0, 0,          0, 1]
  ];
  mtrans_x = [ [1, 0, 0, 40],
               [0, 1, 0,  0],
               [0, 0, 1,  0],
               [0, 0, 0,  1]
  ];
  echo(mrot_y*mtrans_x);
  // This is the object at [0,0,0]
  Obj();
  // This is the starting object at the [40,0,0] coordinate
  multmatrix(mtrans_x) Obj();
  // This is the one rotating and appears 6 times
  multmatrix(mrot_y * mtrans_x) Obj();
};
```

This example skews a model, which is not possible with the other transformations.

```openscad
M = [ [ 1  , 0  , 0  , 0 ],
      [ 0  , 1  , 0.7, 0 ],  // The "0.7" is the skew value; pushed along the y axis as z changes.
      [ 0  , 0  , 1  , 0 ],
      [ 0  , 0  , 0  , 1 ] ] ;
multmatrix(M) { union() {
  cylinder(r=10.0,h=10,center=false);
  cube(size=[10,10,10],center=false);
} }
```

This example shows how a vector is transformed with a multmatrix vector, like this all points in a point array (polygon) can be transformed sequentially. Vector (v) is transformed with a rotation matrix (m), resulting in a new vector (vtrans) which is now rotated and is moving the cube along a circular path radius=v around the z axis without rotating the cube.

```openscad
angle=45;
m=[
  [cos(angle), -sin(angle), 0, 0],
  [sin(angle),  cos(angle), 0, 0],
  [         0,           0, 1, 0]
];
v=[10,0,0];
vm=concat(v,[1]); // need to add [1]
vtrans=m*vm;
echo(vtrans);
translate(vtrans)cube();
```

### Learn more about it here:

- [Affine Transformations](https://en.wikipedia.org/wiki/Transformation_matrix#Affine_transformations) on Wikipedia
- http://www.senocular.com/flash/tutorials/transformmatrix/

---

## color

Displays the child elements using the specified RGB color + alpha value. This is only used for the F5 preview as CGAL and STL (F6) do not currently support color. The alpha value defaults to 1.0 (opaque) if not specified.

**Function signature:**

```openscad
color( c = [r, g, b, a] ) { ... }
color( c = [r, g, b], alpha = 1.0 ) { ... }
color( "#hexvalue" ) { ... }
color( "colorname", 1.0 ) { ... }
```

Note that all four values for red, green, blue, and alpha (RGBA) are expected to be written as floating point values in the range [0.0:1.0].

Graphics industry common practice is to specify RGBA values as integers in the range [0:255]. To convert values from 0 to 256 to the range needed for the color module they can be individually scaled, or the color vector may be scaled thus: `color([0,125,255]/255) { ... }`

> **Warning:** Transparent shapes should be drawn into the scene after opaque ones to be sure that the latter are visible through transparent shapes that are "in front" of them. If drawn after a solid object behind a transparent one might not be visible. [Issue #1390](https://github.com/openscad/openscad/issues/1390) is about this issue.

### Using Named Colors

[Note: Requires version 2011.12] Colors can be specified by name in a case insensitive string. For example `color("red") sphere(5);` will color the sphere red. Alpha may be given as a second parameter: `color("Blue",0.5) cube(5);` or by name `color("green",alpha=0.5) cube(5);`. The color values on the list all have their alpha value set to 1.0, thus fully opaque.

The available color names are taken from the World Wide Web Consortium's [SVG color list](http://www.w3.org/TR/css3-color/). OpenSCAD adds an additional named color, "transparent", with this RGBA value, [0,0,0,0], making it a 100% transparent black.

### CSS Color Names Table

(note that both spellings of grey or gray are accepted, so e.g. slategrey and slategray both work)

Table based on ["Web Colors" from Wikipedia](https://en.wikipedia.org/wiki/Web_colors)

### Using Hexcode Colors

[Note: Requires version 2019.05] Hex values are given as a string of hexadecimal digits, in either RGB or RGBA format, meaning either as three or four values, and each value may be given as one or two hexadecimal digits:

- `#rgb`
- `#rgba`
- `#rrggbb`
- `#rrggbbaa`

If the alpha value is included in the hex value and also as separate parameter, the separate parameter takes precedence.

### Example

A 3-D multicolor sine wave

Here's a code fragment that draws a wavy multicolor object

```openscad
for(i=[0:36]) {
  for(j=[0:36]) {
    color( [0.5+sin(10*i)/2, 0.5+sin(10*j)/2, 0.5+sin(10*(i+j))/2] )
    translate( [i, j, 0] )
    cube( size = [1, 1, 11+10*cos(10*i)*sin(10*j)] );
  }
}
```

Being that -1<=sin(x)<=1 then 0<=(1/2 + sin(x)/2)<=1, allowing for the RGB components assigned to color to remain within the [0,1] interval.

### Example 2

In cases where you want to optionally set a color based on a parameter you can use the following trick:

```openscad
module myModule(withColors=false) {
  c=withColors?"red":undef;
  color(c) circle(r=10);
}
```

Setting the colorname to undef keeps the default colors.

---

## offset

[Note: Requires version 2015.03]

default with no argument at all is (r = 1, chamfer = false)

Offset generates a new 2d interior or exterior outline from an existing outline. There are two modes of operation: radial and delta.

- The **radial** method creates a new outline as if a circle of some radius is rotated around the exterior (r > 0) or interior (r < 0) of the original outline.
- The **delta** method creates a new outline with sides having a fixed distance outward (delta > 0) or inward (delta < 0) from the original outline.

The construction methods produce an outline that is either inside or outside of the original outline. For outlines using delta, when the outline goes around a corner, it can be given an optional chamfer.

Offset is useful for making thin walls by subtracting a negative-offset construction from the original, or the original from a positive offset construction.

Offset can be used to simulate some common solid modeling operations:

- **Fillet:** `offset(r=-3) offset(delta=+3)` rounds all inside (concave) corners, and leaves flat walls unchanged. However, holes less than 2*r in diameter vanish.
- **Round:** `offset(r=+3) offset(delta=-3)` rounds all outside (convex) corners, and leaves flat walls unchanged. However, walls less than 2*r thick vanish.

The first parameter may be passed without a name, in which case it is treated as the r parameter below. All other parameters must be named if used.

### Parameters

**r or delta**

Number. Amount to offset the polygon. When negative, the polygon is offset inward.

- **r** (default parameter if not named) specifies the radius of the circle that is rotated about the outline, either inside or outside. This mode produces rounded corners. The name may be omitted; that is, `offset(c)` is equivalent to `offset(r=c)`.
- **delta** specifies the distance of the new outline from the original outline, and therefore reproduces angled corners. No inward perimeter is generated in places where the perimeter would cross itself.

**chamfer**

Boolean. (default false) When using the delta parameter, this flag defines if edges should be chamfered (cut off with a straight line) or not (extended to their intersection). This parameter has no effect on radial offsets.

**$fa, $fs, and $fn**

The circle resolution special variables may be used to control the smoothness or facet size of curves generated by radial offsets. They have no effect on delta offsets.

### Examples

Positive r/delta value | Negative r/delta value

Result for different parameters. The black polygon is the input for the offset() operation.

```openscad
// Example 1
linear_extrude(height = 60, twist = 90, slices = 60) {
  difference() {
    offset(r = 10) {
      square(20, center = true);
    }
    offset(r = 8) {
      square(20, center = true);
    }
  }
}
```

```openscad
// Example 2
module fillet(r) {
  offset(r = -r) {
    offset(delta = r) {
      children();
    }
  }
}
```

---

## fill

[Note: Requires version Development snapshot]

Fill removes holes from polygons without changing the outline. For convex polygons the result is identical to hull().

### Examples

```openscad
// Example 1
t = "OpenSCAD";
linear_extrude(15) {
  text(t, 50);
}
color("darkslategray") {
  linear_extrude(2) {
    offset(4) {
      fill() {
        text(t, 50);
      }
    }
  }
}
```

---

## minkowski

Displays the [minkowski sum](https://doc.cgal.org/latest/Minkowski_sum_3/index.html) of child nodes.

**Usage example:**

Say you have a flat box, and you want a rounded edge. There are multiple ways to do this (for example, see hull below), but minkowski is elegant. Take your box, and a cylinder:

```openscad
$fn=50;
cube([10,10,1]);
cylinder(r=2,h=1);
```

Then, do a minkowski sum of them (note that the outer dimensions of the box are now 10+2+2 = 14 units by 14 units by 2 units high as the heights of the objects are summed):

```openscad
$fn=50;
minkowski()
{
  cube([10,10,1]);
  cylinder(r=2,h=1);
}
```

NB: The origin of the second object is used for the addition. The following minkowski sums are different: the first expands the original cube by +1 in -x, +x, -y, +y from cylinder, expand 0.5 units in both -z, +z from cylinder. The second expands it by +1 in -x, +x, -y, +y and +z from cylinder, but expand 0 in the -z from cylinder.

```openscad
minkowski() {
  cube([10, 10, 1]);
  cylinder(1, center=true);
}
```

```openscad
minkowski() {
  cube([10, 10, 1]);
  cylinder(1);
}
```

> **Warning:** for high values of $fn the minkowski sum may end up consuming lots of CPU and memory, since it has to combine every child node of each element with all the nodes of each other element. So if for example $fn=100 and you combine two cylinders, then it does not just perform 200 operations as with two independent cylinders, but 100*100 = 10000 operations.

> **Warning:** if one of the inputs is compound, such as:

```openscad
{
  translate([0, 0, collar])
    sphere(ball);
  cylinder(collar, ball, ball);
}
```

> it may be treated as two separate inputs, resulting in an output which is too large, and has features between surfaces that should be unaltered with respect to one another. If so, use `union()`.

---

## hull

Displays the convex hull of child nodes.

**Usage example:**

```openscad
hull() {
  translate([15,10,0]) circle(10);
  circle(10);
}
```

The Hull of 2D objects uses their projections (shadows) on the xy plane, and produces a result on the xy plane. Their Z-height is not used in the operation.

Referring to the illustration of a convex hull of two cylinders, it is computationally more efficient to use hull() on two 2D circles and linear_extrude the resulting 2D shape into a 3D shape, rather than using hull() on two cylinders, even though the resulting object appears identical. Complex geometries involving hull() can be rendered faster by starting out in 2D, if possible.

---

# OpenSCAD User Manual/CSG Modelling

## Boolean overview

### 2D examples

| Operation | Description |
|-----------|-------------|
| union (or) | circle + square |
| difference (and not) | square - circle |
| difference (and not) | circle - square |
| intersection (and) | circle - (circle - square) |

```openscad
union()      {square(10);circle(10);} // square or circle
difference() {square(10);circle(10);} // square and not circle
difference() {circle(10);square(10);} // circle and not square
intersection(){square(10);circle(10);} // square and circle
```

### 3D examples

| Operation | Description |
|-----------|-------------|
| union (or) | sphere + cube |
| difference (and not) | cube - sphere |
| difference (and not) | sphere - cube |
| intersection (and) | sphere - (sphere - cube) |

```openscad
union()      {cube(12, center=true); sphere(8);} // cube or sphere
difference() {cube(12, center=true); sphere(8);} // cube and not sphere
difference() {sphere(8); cube(12, center=true);} // sphere and not cube
intersection(){cube(12, center=true); sphere(8);} // cube and sphere
```

---

## union

Creates a union of all its child nodes. This is the sum of all children (logical or).

May be used with either 2D or 3D objects, but don't mix them.

```openscad
//Usage example:
union() {
  cylinder (h = 4, r=1, center = true, $fn=100);
  rotate ([90,0,0]) cylinder (h = 4, r=0.9, center = true, $fn=100);
}
```

Remark: union is implicit when not used. But it is mandatory, for example, in difference to group first child nodes into one.

> **Note:** It is mandatory for all unions, explicit or implicit, that external faces to be merged not be coincident. Failure to follow this rule results in a design with undefined behavior, and can result in a render which is not manifold (with zero volume portions, or portions inside out), which typically leads to a warning and sometimes removal of a portion of the design from the rendered output. (This can also result in flickering effects during the preview.) This requirement is not a bug, but an intrinsic property of floating point comparisons and the fundamental inability to exactly represent irrational numbers such as those resulting from most rotations. As an example, this is an invalid OpenSCAD program, and will at least lead to a warning on most platforms:

```openscad
// Invalid!
size = 10;
rotation = 17;
union() {
  rotate([rotation, 0, 0])
    cube(size);
  rotate([rotation, 0, 0])
    translate([0, 0, size])
    cube([2, 3, 4]);
}
```

The solution is to always use a small value called an epsilon when merging adjacent faces like this to guarantee overlap. Note the 0.01 eps value used in TWO locations, so that the external result is equivalent to what was intended:

```openscad
// Correct!
size = 10;
rotation = 17;
eps = 0.01;
union() {
  rotate([rotation, 0, 0])
    cube(size);
  rotate([rotation, 0, 0])
    translate([0, 0, size-eps])
    cube([2, 3, 4+eps]);
}
```

---

## difference

Subtracts the 2nd (and all further) child nodes from the first one (logical and not).

May be used with either 2D or 3D objects, but don't mix them.

```openscad
//Usage example:
difference() {
  cylinder (h = 4, r=1, center = true, $fn=100);
  rotate ([90,0,0]) cylinder (h = 4, r=0.9, center = true, $fn=100);
}
```

> **Note:** It is mandatory that surfaces that are to be removed by a difference operation have an overlap, and that the negative piece being removed extends fully outside of the volume it is removing that surface from. Failure to follow this rule can cause preview artifacts and can result in non-manifold render warnings or the removal of pieces from the render output. See the description above in union for why this is required and an example of how to do this by this using a small epsilon value.

### difference with multiple children

Note, in the second instance, the result of adding a union of the 1st and 2nd children.

```openscad
// Usage example for difference of multiple children:
$fn=90;
difference(){
  cylinder(r=5,h=20,center=true);
  rotate([00,140,-45]) color("LightBlue") cylinder(r=2,h=25,center=true);
  rotate([00,40,-50])   cylinder(r=2,h=30,center=true);
  translate([0,0,-10])rotate([00,40,-50]) cylinder(r=1.4,h=30,center=true);
}

// second instance with added union
translate([10,10,0]){
  difference(){
    union(){   // combine 1st and 2nd children
      cylinder(r=5,h=20,center=true);
      rotate([00,140,-45]) color("LightBlue") cylinder(r=2,h=25,center=true);
    }
    rotate([00,40,-50])   cylinder(r=2,h=30,center=true);
    translate([0,0,-10])rotate([00,40,-50]) cylinder(r=1.4,h=30,center=true);
  }
}
```

---

## intersection

Creates the intersection of all child nodes. This keeps the overlapping portion (logical and).

Only the area which is common or shared by all children is retained.

May be used with either 2D or 3D objects, but don't mix them.

```openscad
//Usage example:
intersection() {
  cylinder (h = 4, r=1, center = true, $fn=100);
  rotate ([90,0,0]) cylinder (h = 4, r=0.9, center = true, $fn=100);
}
```

---

## render

> **Warning:** Using render, always calculates the CSG model for this tree (even in OpenCSG preview mode). This can make previewing very slow and OpenSCAD to appear to hang/freeze.

**Usage example:**

```openscad
render(convexity = 1) { ... }
```

### convexity

Integer. The convexity parameter specifies the maximum number of front and back sides a ray intersecting the object might penetrate. This parameter is only needed for correctly displaying the object in OpenCSG preview mode and has no effect on the polyhedron rendering.

This image shows a 2D shape with a convexity of 4, as the ray indicated in red crosses the 2D shape a maximum of 4 times. The convexity of a 3D shape would be determined in a similar way. Setting it to 10 should work fine for most cases.


---

# OpenSCAD User Manual/2D to 3D Extrusion

> *linear_extrude() works like a Playdoh extrusion press*

> *rotate_extrude() emulates throwing a vessel*

Extrusion is the process of creating an object with a fixed cross-sectional profile. OpenSCAD provides two commands to create 3D solids from a 2D shape: linear_extrude() and rotate_extrude(). Linear extrusion is similar to pushing Playdoh through a press with a die of a specific shape. Rotational extrusion is similar to the process of turning or "throwing" a bowl on the Potter's wheel.

Both extrusion methods work on a (possibly disjointed) 2D shape which exists on the X-Y plane. While transformations that operates on both 2D shapes and 3D solids can move a shape off the X-Y plane, when the extrusion is performed the end result is not very intuitive. What actually happens is that any information in the third coordinate (the Z coordinate) is ignored for any 2D shape, this process amounts to an implicit projection() performed on any 2D shape before the extrusion is executed. It is recommended to perform extrusion on shapes that remains strictly on the X-Y plane.

## linear_extrude

Linear Extrusion is an operation that takes a 2D object as input and generates a 3D object as a result. Extrusion follows the V vector which defaults to the Z axis, for specifying a custom value a version > 2021.01 is needed.

In OpenSCAD Extrusion is always performed on the projection (shadow) of the 2d object xy plane; so if you rotate or apply other transformations to the 2d object before extrusion, its shadow shape is what is extruded.

Although the extrusion is linear along the V vector, a twist parameter is available that causes the object to be rotated around the V vector as it is extruding upward. This can be used to rotate the object at its center, as if it is a spiral pillar, or produce a helical extrusion around the V vector, like a pig's tail.

A scale parameter is also included so that the object can be expanded or contracted over the extent of the extrusion, allowing extrusions to be flared inward or outward.

### Usage

```
linear_extrude(height = 5, v = [0, 0, 1], center = true, convexity = 10, twist = -fanrot, slices = 20, scale = 1.0, $fn = 16) {...}
```

You must use parameter names due to a backward compatibility issue.

- **height** : The extrusion height.
- **center** : If true, the solid is centered after extrusion.
- **twist** : The extrusion twist in degrees.
- **scale** : Scales the 2D shape by this value over the height of the extrusion.
- **slices** : Similar to special variable $fn without being passed down to the child 2D shape.
- **segments** : Similar to slices but adding points on the polygon's segments without changing the polygon's shape.
- **convexity** : If parts of the model appear to be transparent, it may be because the preview needs a hint about the shape and you need to set the convexity parameter. 10 is a good value to try.

height must be positive.

v is a 3D vector that must point into positive Z direction \[Note: Requires version Development snapshot\]

$fn is optional and specifies the resolution of the linear_extrude (higher number brings more "smoothness", but more computation time is needed).

If the extrusion fails for a non-trivial 2D shape, try setting the convexity parameter (the default is not 10, but 10 is a "good" value to try). See explanation further down.

### Twist

Twist is the number of degrees of through which the shape is extruded. Setting the parameter twist = 360 extrudes through one revolution. The twist direction follows the left hand rule.

**0° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = 0)
translate([2, 0, 0])
circle(r = 1);
```

**-100° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = -100)
translate([2, 0, 0])
circle(r = 1);
```

**100° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = 100)
translate([2, 0, 0])
circle(r = 1);
```

**-500° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = -500)
translate([2, 0, 0])
circle(r = 1);
```

### Center

It is similar to the parameter center of cylinders. If center is false the linear extrusion Z range is from 0 to height; if it is true, the range is from -height/2 to height/2.

**center = true**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = -500)
translate([2, 0, 0])
circle(r = 1);
```

**center = false**

```openscad
linear_extrude(height = 10, center = false, convexity = 10, twist = -500)
translate([2, 0, 0])
circle(r = 1);
```

### Mesh Refinement

The slices parameter defines the number of intermediate points along the Z axis of the extrusion. Its default increases with the value of twist. Explicitly setting slices may improve the output refinement. Additional the segments parameter adds vertices (points) to the extruded polygon resulting in smoother twisted geometries. Segments need to be a multiple of the polygon's fragments to have an effect (6 or 9.. for a circle($fn=3), 8,12.. for a square() ).

```openscad
linear_extrude(height = 10, center = false, convexity = 10, twist = 360, slices = 100)
translate([2, 0, 0])
circle(r = 1);
```

The special variables $fn, $fs and $fa can also be used to improve the output. If slices is not defined, its value is taken from the defined $fn value.

```openscad
linear_extrude(height = 10, center = false, convexity = 10, twist = 360, $fn = 100)
translate([2, 0, 0])
circle(r = 1);
```

### Scale

Scales the 2D shape by this value over the height of the extrusion. Scale can be a scalar or a vector:

```openscad
linear_extrude(height = 10, center = true, convexity = 10, scale=3)
translate([2, 0, 0])
circle(r = 1);
```

```openscad
linear_extrude(height = 10, center = true, convexity = 10, scale=[1,5], $fn=100)
translate([2, 0, 0])
circle(r = 1);
```

Note that if scale is a vector, the resulting side walls may be nonplanar. Use twist=0 and the slices parameter to avoid asymmetry (https://github.com/openscad/openscad/issues/1341).

```openscad
linear_extrude(height=10, scale=[1,0.1], slices=20, twist=0)
polygon(points=[[0,0],[20,10],[20,-10]]);
```

### Using with imported SVG

A common usage of linear_extrude() is to import a 2D svg

```openscad
linear_extrude(height = 10, center = true)
import("knight.svg");
```

## rotate_extrude

Rotational extrusion spins a 2D shape around the Z-axis to form a solid which has rotational symmetry. One way to think of this operation is to imagine a Potter's wheel placed on the X-Y plane with its axis of rotation pointing up towards +Z. Then place the to-be-made object on this virtual Potter's wheel (possibly extending down below the X-Y plane towards -Z). The to-be-made object is the cross-section of the object on the X-Y plane (keeping only the right half, X >= 0). That is the 2D shape that will be fed to rotate_extrude() as the child in order to generate this solid. Note that the object started on the X-Y plane but is tilted up (rotated +90 degrees about the X-axis) to extrude.

Since a 2D shape is rendered by OpenSCAD on the X-Y plane, an alternative way to think of this operation is as follows: spins a 2D shape around the Y-axis to form a solid. The resultant solid is placed so that its axis of rotation lies along the Z-axis.

Just like the linear_extrude, the extrusion is always performed on the projection of the 2D polygon to the XY plane. Transformations like rotate, translate, etc. applied to the 2D polygon before extrusion modify the projection of the 2D polygon to the XY plane and therefore also modify the appearance of the final 3D object.

- A translation in Z of the 2D polygon has no effect on the result (as also the projection is not affected).
- A translation in X increases the diameter of the final object.
- A translation in Y results in a shift of the final object in Z direction.
- A rotation about the X or Y axis distorts the cross section of the final object, as also the projection to the XY plane is distorted.

Don't get confused, as OpenSCAD displays 2D polygons with a certain height in the Z direction, so the 2D object (with its height) appears to have a bigger projection to the XY plane. But for the projection to the XY plane and also for the later extrusion only the base polygon without height is used.

You cannot use rotate_extrude to produce a helix or screw thread. Doing this properly can be difficult, so it's best to find a thread library to make them for you.

The 2D shape must lie completely on either the right (recommended) or the left side of the Y-axis. More precisely speaking, every vertex of the shape must have either x >= 0 or x <= 0. If the shape spans the X axis a warning appears in the console windows and the rotate_extrude() is ignored. If the 2D shape touches the Y axis, i.e. at x=0, it must be a line that touches, not a point, as a point results in a zero thickness 3D object, which is invalid and results in a CGAL error. For OpenSCAD versions prior to 2016.xxxx, if the shape is in the negative axis the resulting faces are oriented inside-out, which may cause undesired effects.

### Usage

```
rotate_extrude(angle = 360, start=0, convexity = 2) {...}
```

In 2021.01 and previous, you must use parameter names due to a backward compatibility issue.

- **angle** \[Note: Requires version 2019.05\] : Defaults to 360. Specifies the number of degrees to sweep, starting at the positive X axis. The direction of the sweep follows the Right Hand Rule, hence a negative angle sweeps clockwise.
- **start** \[Note: Requires version Development snapshot\] : Defaults to 0 if angle is specified, and 180 if not. Specifies the starting angle of the extrusion, counter-clockwise from the positive X axis.
- **convexity** : If parts of the model appear to be transparent, it may be because the preview needs a hint about the shape and you need to set the convexity parameter. 10 is a good value to try.

> Right-hand grip rule

The standard circular-resolution variables control the number of fragments used in the extrusion:

- **$fa** : minimum angle (in degrees) of each fragment.
- **$fs** : minimum circumferential length of each fragment.
- **$fn** : fixed number of fragments in 360 degrees. Values of 3 or more override $fa and $fs.

### Examples

A simple torus can be constructed using a rotational extrude.

```openscad
rotate_extrude(convexity = 10)
translate([2, 0, 0])
circle(r = 1);
```

### Mesh Refinement

Increasing the number of fragments composing the 2D shape improves the quality of the mesh, but takes longer to render.

```openscad
rotate_extrude(convexity = 10)
translate([2, 0, 0])
circle(r = 1, $fn = 100);
```

The number of fragments used by the extrusion can also be increased.

```openscad
rotate_extrude(convexity = 10, $fn = 100)
translate([2, 0, 0])
circle(r = 1, $fn = 100);
```

### Extruding a Polygon

Extrusion can also be performed on polygons with points chosen by the user.

Here is a simple polygon and its 200 step rotational extrusion. (Note it has been rotated 90 degrees to show how the rotation appears; the rotate_extrude() needs it flat).

```openscad
rotate([90,0,0]) polygon( points=[[0,0],[2,1],[1,2],[1,3],[3,4],[0,5]] );
rotate_extrude($fn=200) polygon( points=[[0,0],[2,1],[1,2],[1,3],[3,4],[0,5]] );
```

For more information on polygons, please see: 2D Primitives: Polygon.

### Combining Extrusions

Using the angle parameter \[Note: Requires version 2019.05\], a hook can be modeled.

```openscad
eps = 0.01;
translate([eps, 60, 0])
rotate_extrude(angle=270, convexity=10)
translate([40, 0]) circle(10);
rotate_extrude(angle=90, convexity=10)
translate([20, 0]) circle(10);
translate([20, eps, 0])
rotate([90, 0, 0]) cylinder(r=10, h=80+eps);
```

### Orientation

If you're making a round 360 degree extrusion, it doesn't matter where it starts. If, on the other hand, you're using $fn to make an extrusion with some specific number of sides, it can matter. With an odd number of sides, there will be a vertex on either the left or the right, and a side opposite it.

With angle not specified, the extrusion starts along the negative X axis, to the left of the origin. With an odd number of sides, there is a vertex on the left and a side on the right. (Note that this is inconsistent with the behavior for angle less than 360, and with the behavior for circle and other round primitives.)

With angle specified, and not equal to 360, the extrusion starts along the positive X axis, to the right of the origin.

For 2021.01 and earlier, if angle is equal to 360, the extrusion starts along the negative X axis, as for angle not being specified.

For the development snapshot, if angle is 360, the extrusion starts along the positive X axis, as for other cases where angle is specified. Explicitly specifying angle=360 thus yields results consistent with other round primitives.

A future release may change this behavior so that when angle is not specified the extrusion starts along the positive X axis, making all of these cases consistent.

start directly controls the start point. \[Note: Requires version Development snapshot\]

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/2D_to_3D_Extrusion&oldid=4540277"

---

# OpenSCAD User Manual/3D to 2D Projection

Using projection(), you can create 2d drawings from 3d models, and export them to the dxf format. It works by projecting a 3D model to the (x,y) plane, with z at 0. If cut=true, only points with z=0 are considered (effectively cutting the object), with cut=false(the default), points above and below the plane are considered as well (creating a proper projection).

Example: Consider example002.scad, that comes with OpenSCAD.

Then you can do a 'cut' projection, which gives you the 'slice' of the x-y plane with z=0.

```openscad
projection(cut = true) example002();
```

You can also do an 'ordinary' projection, which gives a sort of 'shadow' of the object onto the xy plane.

```openscad
projection(cut = false) example002();
```

## Another Example

You can also use projection to get a 'side view' of an object. Let's take example002, rotate it, and move it up out of the X-Y plane:

```openscad
translate([0,0,25]) rotate([90,0,0]) example002();
```

Now we can get a side view with projection()

```openscad
projection() translate([0,0,25]) rotate([90,0,0]) example002();
```

Links:

- [More complicated example](http://www.gilesbathgate.com/2010/06/extracting-2d-mendel-outlines-using-openscad/) from Giles Bathgate's blog

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/3D_to_2D_Projection&oldid=4536715"

---

# OpenSCAD User Manual/Using the 2D Subsystem

## 2D Primitives

All 2D primitives can be transformed with 3D transformations. They are usually used as part of a 3D extrusion. Although they are infinitely thin, they are rendered with a 1-unit thickness.

Note: Trying to subtract with difference() from 3D object will lead to unexpected results in final rendering.

### square

Creates a square or rectangle in the first quadrant. When center is true the square is centered on the origin. Argument names are optional if given in the order shown here.

```
square(size = [x, y], center = true/false);
square(size =  x  , center = true/false);
```

**parameters:**

- **size**
  - single value, square with both sides this length
  - 2 value array \[x,y\], rectangle with dimensions x and y
- **center**
  - false (default), 1st (positive) quadrant, one corner at (0,0)
  - true, square is centered at (0,0)

**defaults:** `square();` yields: `square(size = [1, 1], center = false);`

**examples:**

equivalent scripts for this example

```openscad
square(size = 10);
square(10);
square([10,10]);
.
square(10,false);
square([10,10],false);
square([10,10],center=false);
square(size = [10, 10], center = false);
square(center = false,size = [10, 10] );
```

equivalent scripts for this example

```openscad
square([20,10],true);
a=[20,10];square(a,true);
```

### circle

Creates a circle at the origin. All parameters, except r, must be named.

```
circle(r=radius | d=diameter);
```

**Parameters**

- **r** : circle radius. r name is the only one optional with circle.
  - circle resolution is based on size, using $fa or $fs.
  - For a small, high resolution circle you can make a large circle, then scale it down, or you could set $fn or other special variables.
  - Note: These examples exceed the resolution of a 3d printer as well as of the display screen.

```openscad
scale([1/100, 1/100, 1/100]) circle(200); // create a high resolution circle with a radius of 2.
circle(2, $fn=50);                        // Another way.
```

- **d** : circle diameter (only available in versions later than 2014.03).
- **$fa** : minimum angle (in degrees) of each fragment.
- **$fs** : minimum circumferential length of each fragment.
- **$fn** : fixed number of fragments in 360 degrees. Values of 3 or more override $fa and $fs.

If they are used, $fa, $fs and $fn must be named parameters. click here for more details,.

**defaults:** `circle();` yields: `circle($fn = 0, $fa = 12, $fs = 2, r = 1);`

Equivalent scripts for this example

```openscad
circle(10);
circle(r=10);
circle(d=20);
circle(d=2+9*2);
```

#### Ellipses

An ellipse can be created from a circle by using either scale() or resize() to make the x and y dimensions unequal. See OpenSCAD User Manual/Transformations

equivalent scripts for this example

```openscad
resize([30,10])circle(d=20);
scale([1.5,.5])circle(d=20);
```

#### Regular Polygons

A regular polygon of 3 or more sides can be created by using circle() with $fn set to the number of sides. The following two pieces of code are equivalent.

```openscad
circle(r=1, $fn=4);
```

```openscad
module regular_polygon(order = 4, r=1){
    angles=[ for (i = [0:order-1]) i*(360/order) ];
    coords=[ for (th=angles) [r*cos(th), r*sin(th)] ];
    polygon(coords);
}
regular_polygon();
```

These result in the following shapes, where the polygon is inscribed within the circle with all sides (and angles) equal. One corner points to the positive x direction. For irregular shapes see the polygon primitive below.

script for these examples

```openscad
translate([-42, 0]){circle(20,$fn=3);%circle(20,$fn=90);}
translate([ 0, 0]) circle(20,$fn=4);
translate([ 42, 0]) circle(20,$fn=5);
translate([-42,-42]) circle(20,$fn=6);
translate([ 0,-42]) circle(20,$fn=8);
translate([ 42,-42]) circle(20,$fn=12);

color("black"){
    translate([-42, 0,1])text("3",7,,center);
    translate([ 0, 0,1])text("4",7,,center);
    translate([ 42, 0,1])text("5",7,,center);
    translate([-42,-42,1])text("6",7,,center);
    translate([ 0,-42,1])text("8",7,,center);
    translate([ 42,-42,1])text("12",7,,center);
}
```

### polygon

Creates a multiple sided shape from a list of x,y coordinates. A polygon is the most powerful 2D object. It can create anything that circle and squares can, as well as much more. This includes irregular shapes with both concave and convex edges. In addition it can place holes within that shape.

```
polygon(points = [ [x, y], ... ], paths = [ [p1, p2, p3..], ...], convexity = N);
```

**Parameters**

- **points**
  - The list of x,y points of the polygon. : A vector of 2 element vectors.
  - Note: points are indexed from 0 to n-1.
- **paths**
  - **default**
    - If no path is specified, all points are used in the order listed.
  - **single vector**
    - The order to traverse the points. Uses indices from 0 to n-1. May be in a different order and use all or part, of the points listed.
  - **multiple vectors**
    - Creates primary and secondary shapes. Secondary shapes are subtracted from the primary shape (like difference()).
    - Secondary shapes may be wholly or partially within the primary shape.
    - A closed shape is created by returning from the last point specified to the first.
- **convexity**
  - Integer number of "inward" curves, ie. expected path crossings of an arbitrary line through the polygon. See below.

**defaults:** `polygon();` yields: `polygon(points = undef, paths = undef, convexity = 1);`

#### Without holes

equivalent scripts for this example

```openscad
polygon(points=[[0,0],[100,0],[130,50],[30,50]]);
polygon([[0,0],[100,0],[130,50],[30,50]], paths=[[0,1,2,3]]);
polygon([[0,0],[100,0],[130,50],[30,50]],[[3,2,1,0]]);
polygon([[0,0],[100,0],[130,50],[30,50]],[[1,0,3,2]]);

a=[[0,0],[100,0],[130,50],[30,50]];
b=[[3,0,1,2]];
polygon(a);
polygon(a,b);
polygon(a,[[2,3,0,1,2]]);
```

#### One hole

equivalent scripts for this example

```openscad
polygon(points=[[0,0],[100,0],[0,100],[10,10],[80,10],[10,80]], paths=[[0,1,2],[3,4,5]],convexity=10);

triangle_points =[[0,0],[100,0],[0,100],[10,10],[80,10],[10,80]];
triangle_paths =[[0,1,2],[3,4,5]];
polygon(triangle_points,triangle_paths,10);
```

The 1st path vector, \[0,1,2\], selects the points, \[0,0\],\[100,0\],\[0,100\], for the primary shape. The 2nd path vector, \[3,4,5\], selects the points, \[10,10\], \[80,10\],\[10,80\], for the secondary shape. The secondary shape is subtracted from the primary ( think difference() ). Since the secondary is wholly within the primary, it leaves a shape with a hole.

#### Multi hole

\[Note: Requires version 2015.03\] (for use of concat())

```openscad
//example polygon with multiple holes
a0 = [[0,0],[100,0],[130,50],[30,50]];     // main
b0 = [1,0,3,2];
a1 = [[20,20],[40,20],[30,30]];            // hole 1
b1 = [4,5,6];
a2 = [[50,20],[60,20],[40,30]];            // hole 2
b2 = [7,8,9];
a3 = [[65,10],[80,10],[80,40],[65,40]];    // hole 3
b3 = [10,11,12,13];
a4 = [[98,10],[115,40],[85,40],[85,10]];   // hole 4
b4 = [14,15,16,17];
a  = concat (a0,a1,a2,a3,a4);
b  = [b0,b1,b2,b3,b4];
polygon(a,b);
//alternate
polygon(a,[b0,b1,b2,b3,b4]);
```

#### Extruding a 3D shape from a polygon

```openscad
translate([0,-20,10]) {
    rotate([90,180,90]) {
        linear_extrude(50) {
            polygon(
                points = [
                    //x,y
                    /*
                        O .
                    */
                    [-2.8,0],
                    /*
                        O__X .
                    */
                    [-7.8,0],
                    /*
                          O
                         \
                        X__X .
                    */
                    [-15.3633,10.30],
                    /*
                        X_______._____O
                         \
                        X__X .
                    */
                    [15.3633,10.30],
                    /*
                        X_______._______X
                         \             /
                        X__X .     O
                    */
                    [7.8,0],
                    /*
                        X_______._______X
                         \             /
                        X__X . O__X
                    */
                    [2.8,0],
                    /*
                        X__________.__________X
                         \                   /
                          \       O         /
                           \     / /       /
                            \   / /       /
                        X__X . X__X
                    */
                    [5.48858,5.3],
                    /*
                        X__________.__________X
                         \                   /
                          \ O__________X    /
                           \     / /       /
                            \   / /       /
                        X__X . X__X
                    */
                    [-5.48858,5.3],
                ]
            );
        }
    }
}
```

#### convexity

The convexity parameter specifies the maximum number of front sides (back sides) a ray intersecting the object might penetrate. This parameter is needed only for correct display of the object in OpenCSG preview mode and has no effect on the polyhedron rendering.

This image shows a 2D shape with a convexity of 2, as the ray indicated in red crosses the 2D shapes outside⇒inside (or inside⇒outside) a maximum of 2 times. The convexity of a 3D shape would be determined in a similar way. Setting it to 10 should work fine for most cases.

### import_dxf

\[Deprecated: import\_dxf() is deprecated and will be removed in a future release. Use Use [import()](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/The_OpenSCAD_Language#import) instead. instead.\]

Read a DXF file and create a 2D shape.

Example

```openscad
linear_extrude(height = 5, center = true, convexity = 10)
import_dxf(file = "example009.dxf", layer = "plate");
```

### Text

The text module creates text as a 2D geometric object, using fonts installed on the local system or provided as separate font file.

\[Note: Requires version 2015.03\]

**Parameters**

- **text**
  - String. The text to generate.
- **size**
  - Decimal. The generated text has an ascent (height above the baseline) of approximately this value. Default is 10. Fonts vary and may be a different height, typically slightly smaller. The formula to convert the size value to "points" is pt = size \* 3.937, so a size argument of 3.05 will give about 12pt text, for instance. Note: if you know a point is 1/72" this may not look right, but point measurements of text are the distance from ascent to descent, not from ascent to baseline as in this case.
- **font**
  - String. The name of the font that should be used. This is not the name of the font file, but the logical font name (internally handled by the fontconfig library). This can also include a style parameter, see below. A list of installed fonts & styles can be obtained using the font list dialog (Help -> Font List).
- **direction**
  - String. Direction of the text flow. Possible values are "ltr" (left-to-right), "rtl" (right-to-left), "ttb" (top-to-bottom) and "btt" (bottom-to-top). Default is "ltr".
- **language**
  - String. The language of the text (e.g., "en", "ar", "ch"). Default is "en".
- **script**
  - String. The script of the text (e.g., "latin", "arabic", "hani"). Default is "latin".
- **halign**
  - String. The horizontal alignment for the text. Possible values are "left", "center" and "right". Default is "left".
- **valign**
  - String. The vertical alignment for the text. Possible values are "top", "center", "baseline" and "bottom". Default is "baseline".
- **spacing**
  - Decimal. Factor to increase/decrease the character spacing. The default value of 1 results in the normal spacing for the font, giving a value greater than 1 causes the letters to be spaced further apart.
- **$fn**
  - used for subdividing the curved path segments provided by freetype

**Example**

```openscad
text("OpenSCAD");
```

#### Notes

To allow specification of particular Unicode characters, you can specify them in a string with the following escape codes;

- `\x03` - hex char-value (only hex values from 01 to 7f are supported)
- `\u0123` - Unicode char with 4 hexadecimal digits (note: lowercase \\u)
- `\U012345` - Unicode char with 6 hexadecimal digits (note: uppercase \\U)

The null character (NUL) is mapped to the space character (SP).

```openscad
assert(version() == [2019, 5, 0]);
assert(ord(" ") == 32);
assert(ord("\x00") == 32);
assert(ord("\u0000") == 32);
assert(ord("\U000000") == 32);
```

**Example**

```openscad
t="\u20AC10 \u263A"; // 10 euro and a smilie
```

#### Using Fonts & Styles

Fonts are specified by their logical font name; in addition a style parameter can be added to select a specific font style like "bold" or "italic", such as:

```
font="Liberation Sans:style=Bold Italic"
```

The font list dialog (available under Help > Font List) shows the font name and the font style for each available font. For reference, the dialog also displays the location of the font file. You can drag a font in the font list, into the editor window to use in the text() statement.

> OpenSCAD font list dialog

OpenSCAD includes the fonts Liberation Mono, Liberation Sans, and Liberation Serif. Hence, as fonts in general differ by platform type, use of these included fonts is likely to be portable across platforms.

For common/casual text usage, the specification of one of these fonts is recommended for this reason. Liberation Sans is the default font to encourage this.

In addition to the installed fonts ( for windows only fonts installed as admin for all users ), it's possible to add project specific font files. Supported font file formats are TrueType Fonts (\*.ttf) and OpenType Fonts (\*.otf). The files need to be registered with use<>.

```openscad
use <ttf/paratype-serif/PTF55F.ttf>
```

After the registration, the font is listed in the font list dialog, so in case logical name of a font is unknown, it can be looked up as it was registered.

OpenSCAD uses fontconfig to find and manage fonts, so it's possible to list the system configured fonts on command line using the fontconfig tools in a format similar to the GUI dialog.

Under Windows, fonts are stored in the Windows Registry. To get a file with the font file names, use the command:

```
$ fc-list -f "%-60{{%{family[0]}%{:style[0]=}}}%{file}\n" | sort
```

```
...
Liberation Mono:style=Bold Italic /usr/share/fonts/truetype/liberation2/LiberationMono-BoldItalic.ttf
Liberation Mono:style=Bold        /usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf
Liberation Mono:style=Italic      /usr/share/fonts/truetype/liberation2/LiberationMono-Italic.ttf
Liberation Mono:style=Regular     /usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf
...
```

```
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts" /s > List_Fonts_Windows.txt
```

**Example**

```openscad
square(10);

translate([15, 15]) {
    text("OpenSCAD", font = "Liberation Sans");
}

translate([15, 0]) {
    text("OpenSCAD", font = "Liberation Sans:style=Bold Italic");
}
```

#### Alignment

##### Vertical alignment

- **top**
  - The text is aligned so the top of the tallest character in your text is at the given Y coordinate.
- **center**
  - The text is aligned with the center of the bounding box at the given Y coordinate. This bounding box is based on the actual sizes of the letters, so taller letters and descenders will affect the positioning.
- **baseline**
  - The text is aligned with the font baseline at the given Y coordinate. This is the default, and is the only option that makes different pieces of text align vertically, as if they were written on lined paper, regardless of character heights and descenders.
- **bottom**
  - The text is aligned so the bottom of the lowest-reaching character in your text is at the given Y coordinate.

```openscad
text = "Align";
font = "Liberation Sans";

valign = [
    [ 0, "top"],
    [ 40, "center"],
    [ 75, "baseline"],
    [110, "bottom"]
];

for (a = valign) {
    translate([10, 120 - a[0], 0]) {
        color("red") cube([135, 1, 0.1]);
        color("blue") cube([1, 20, 0.1]);
        linear_extrude(height = 0.5) {
            text(text = str(text,"_",a[1]), font = font, size = 20, valign = a[1]);
        }
    }
}
```

> OpenSCAD vertical text alignment

The text() module doesn't support multi-line text, but you can make a separate call for each line, using translate() to space them. A spacing of 1.4\*size is the minimum required to prevent lines overlapping (if they include descenders). 1.6\*size is approximately the default single-spacing in many word processing programs. To get evenly spaced lines, use "baseline" vertical alignment; otherwise, lines may be lower or higher depending on their contents.

##### Horizontal alignment

- **left**
  - The text is aligned with the left side of the bounding box at the given X coordinate. This is the default.
- **center**
  - The text is aligned with the center of the bounding box at the given X coordinate.
- **right**
  - The text is aligned with the right of the bounding box at the given X coordinate.

```openscad
text = "Align";
font = "Liberation Sans";

halign = [
    [10, "left"],
    [50, "center"],
    [90, "right"]
];

for (a = halign) {
    translate([140, a[0], 0]) {
        color("red") cube([115, 2,0.1]);
        color("blue") cube([2, 20,0.1]);
        linear_extrude(height = 0.5) {
            text(text = str(text,"_",a[1]), font = font, size = 20, halign = a[1]);
        }
    }
}
```

> OpenSCAD horizontal text alignment

#### 3D text

Text can be changed from a 2 dimensional object into a 3D object by using linear_extrude.

```openscad
//3d Text Example
linear_extrude(4)
    text("Text");
```

#### Metrics

##### textmetrics()

\[Note: Requires version Development snapshot\]

The textmetrics() function accepts the same parameters as text(), and returns an object describing how the text would be rendered.

The returned object has these members:

- **position**: the position of the lower-left corner of the generated text.
- **size**: the size of the generated text.
- **ascent**: the amount that the text extends above the baseline.
- **descent**: the amount that the text extends below the baseline.
- **offset**: the origin of the text after aligning. Text typically starts slightly right of this point.
- **advance**: the "other end" of the text, the point at which additional text should be positioned, relative to "offset". Text generally ends slightly left of this point.

```openscad
s = "Hello, World!";
size = 20;
font = "Liberation Serif";
tm = textmetrics(s, size=size, font=font);
echo(tm);

translate([0,0,1]) text("Hello, World!", size=size, font=font);
color("black") translate(tm.position) square(tm.size);
```

yields (reformatted for readability):

```
ECHO: {
    position = [0.7936, -4.2752];
    size = [149.306, 23.552];
    ascent = 19.2768;
    descent = -4.2752;
    offset = [0, 0];
    advance = [153.09, 0];
}
```

> Using textmetrics() to draw a box around text

##### fontmetrics()

The fontmetrics() function accepts a font size and a font name, both optional, and returns an object describing global characteristics of the font.

**Parameters**

- **size**
  - Decimal, optional. The size of the font, as described above for text().
- **font**
  - String, optional. The name of the font, as described above for text().

Note that omitting the size and/or font may be useful to get information about the default font.

**Returns an object:**

- **nominal**: usual dimensions for a glyph:
  - **ascent**: height above the baseline
  - **descent**: depth below the baseline
- **max**: maximum dimensions for a glyph:
  - **ascent**: height above the baseline
  - **descent**: depth below the baseline
- **interline**: design distance from one baseline to the next
- **font**: identification information about the font:
  - **family**: the font family name
  - **style**: the style (Regular, Italic, et cetera)

```openscad
echo(fontmetrics(font="Liberation Serif"));
```

yields (reformatted for readability):

```
ECHO: {
    nominal = {
        ascent = 12.3766;
        descent = -3.0043;
    };
    max = {
        ascent = 13.6312;
        descent = -4.2114;
    };
    interline = 15.9709;
    font = {
        family = "Liberation Serif";
        style = "Regular";
    };
}
```

## 3D to 2D Projection

Using projection(), you can create 2d drawings from 3d models, and export them to the dxf format. It works by projecting a 3D model to the (x,y) plane, with z at 0. If cut=true, only points with z=0 are considered (effectively cutting the object), with cut=false(the default), points above and below the plane are considered as well (creating a proper projection).

Example: Consider example002.scad, that comes with OpenSCAD.

Then you can do a 'cut' projection, which gives you the 'slice' of the x-y plane with z=0.

```openscad
projection(cut = true) example002();
```

You can also do an 'ordinary' projection, which gives a sort of 'shadow' of the object onto the xy plane.

```openscad
projection(cut = false) example002();
```

### Another Example

You can also use projection to get a 'side view' of an object. Let's take example002, rotate it, and move it up out of the X-Y plane:

```openscad
translate([0,0,25]) rotate([90,0,0]) example002();
```

Now we can get a side view with projection()

```openscad
projection() translate([0,0,25]) rotate([90,0,0]) example002();
```

Links:

- [More complicated example](http://www.gilesbathgate.com/2010/06/extracting-2d-mendel-outlines-using-openscad/) from Giles Bathgate's blog

## 2D to 3D Extrusion

> *linear_extrude() works like a Playdoh extrusion press*

> *rotate_extrude() emulates throwing a vessel*

Extrusion is the process of creating an object with a fixed cross-sectional profile. OpenSCAD provides two commands to create 3D solids from a 2D shape: linear_extrude() and rotate_extrude(). Linear extrusion is similar to pushing Playdoh through a press with a die of a specific shape. Rotational extrusion is similar to the process of turning or "throwing" a bowl on the Potter's wheel.

Both extrusion methods work on a (possibly disjointed) 2D shape which exists on the X-Y plane. While transformations that operates on both 2D shapes and 3D solids can move a shape off the X-Y plane, when the extrusion is performed the end result is not very intuitive. What actually happens is that any information in the third coordinate (the Z coordinate) is ignored for any 2D shape, this process amounts to an implicit projection() performed on any 2D shape before the extrusion is executed. It is recommended to perform extrusion on shapes that remains strictly on the X-Y plane.

### linear_extrude

Linear Extrusion is an operation that takes a 2D object as input and generates a 3D object as a result. Extrusion follows the V vector which defaults to the Z axis, for specifying a custom value a version > 2021.01 is needed.

In OpenSCAD Extrusion is always performed on the projection (shadow) of the 2d object xy plane; so if you rotate or apply other transformations to the 2d object before extrusion, its shadow shape is what is extruded.

Although the extrusion is linear along the V vector, a twist parameter is available that causes the object to be rotated around the V vector as it is extruding upward. This can be used to rotate the object at its center, as if it is a spiral pillar, or produce a helical extrusion around the V vector, like a pig's tail.

A scale parameter is also included so that the object can be expanded or contracted over the extent of the extrusion, allowing extrusions to be flared inward or outward.

#### Usage

```
linear_extrude(height = 5, v = [0, 0, 1], center = true, convexity = 10, twist = -fanrot, slices = 20, scale = 1.0, $fn = 16) {...}
```

You must use parameter names due to a backward compatibility issue.

- **height** : The extrusion height.
- **center** : If true, the solid is centered after extrusion.
- **twist** : The extrusion twist in degrees.
- **scale** : Scales the 2D shape by this value over the height of the extrusion.
- **slices** : Similar to special variable $fn without being passed down to the child 2D shape.
- **segments** : Similar to slices but adding points on the polygon's segments without changing the polygon's shape.
- **convexity** : If parts of the model appear to be transparent, it may be because the preview needs a hint about the shape and you need to set the convexity parameter. 10 is a good value to try.

height must be positive.

v is a 3D vector that must point into positive Z direction \[Note: Requires version Development snapshot\]

$fn is optional and specifies the resolution of the linear_extrude (higher number brings more "smoothness", but more computation time is needed).

If the extrusion fails for a non-trivial 2D shape, try setting the convexity parameter (the default is not 10, but 10 is a "good" value to try). See explanation further down.

#### Twist

Twist is the number of degrees of through which the shape is extruded. Setting the parameter twist = 360 extrudes through one revolution. The twist direction follows the left hand rule.

**0° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = 0)
translate([2, 0, 0])
circle(r = 1);
```

**-100° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = -100)
translate([2, 0, 0])
circle(r = 1);
```

**100° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = 100)
translate([2, 0, 0])
circle(r = 1);
```

**-500° of Twist**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = -500)
translate([2, 0, 0])
circle(r = 1);
```

#### Center

It is similar to the parameter center of cylinders. If center is false the linear extrusion Z range is from 0 to height; if it is true, the range is from -height/2 to height/2.

**center = true**

```openscad
linear_extrude(height = 10, center = true, convexity = 10, twist = -500)
translate([2, 0, 0])
circle(r = 1);
```

**center = false**

```openscad
linear_extrude(height = 10, center = false, convexity = 10, twist = -500)
translate([2, 0, 0])
circle(r = 1);
```

#### Mesh Refinement

The slices parameter defines the number of intermediate points along the Z axis of the extrusion. Its default increases with the value of twist. Explicitly setting slices may improve the output refinement. Additional the segments parameter adds vertices (points) to the extruded polygon resulting in smoother twisted geometries. Segments need to be a multiple of the polygon's fragments to have an effect (6 or 9.. for a circle($fn=3), 8,12.. for a square() ).

```openscad
linear_extrude(height = 10, center = false, convexity = 10, twist = 360, slices = 100)
translate([2, 0, 0])
circle(r = 1);
```

The special variables $fn, $fs and $fa can also be used to improve the output. If slices is not defined, its value is taken from the defined $fn value.

```openscad
linear_extrude(height = 10, center = false, convexity = 10, twist = 360, $fn = 100)
translate([2, 0, 0])
circle(r = 1);
```

#### Scale

Scales the 2D shape by this value over the height of the extrusion. Scale can be a scalar or a vector:

```openscad
linear_extrude(height = 10, center = true, convexity = 10, scale=3)
translate([2, 0, 0])
circle(r = 1);
```

```openscad
linear_extrude(height = 10, center = true, convexity = 10, scale=[1,5], $fn=100)
translate([2, 0, 0])
circle(r = 1);
```

Note that if scale is a vector, the resulting side walls may be nonplanar. Use twist=0 and the slices parameter to avoid asymmetry (https://github.com/openscad/openscad/issues/1341).

```openscad
linear_extrude(height=10, scale=[1,0.1], slices=20, twist=0)
polygon(points=[[0,0],[20,10],[20,-10]]);
```

#### Using with imported SVG

A common usage of linear_extrude() is to import a 2D svg

```openscad
linear_extrude(height = 10, center = true)
import("knight.svg");
```

### rotate_extrude

Rotational extrusion spins a 2D shape around the Z-axis to form a solid which has rotational symmetry. One way to think of this operation is to imagine a Potter's wheel placed on the X-Y plane with its axis of rotation pointing up towards +Z. Then place the to-be-made object on this virtual Potter's wheel (possibly extending down below the X-Y plane towards -Z). The to-be-made object is the cross-section of the object on the X-Y plane (keeping only the right half, X >= 0). That is the 2D shape that will be fed to rotate_extrude() as the child in order to generate this solid. Note that the object started on the X-Y plane but is tilted up (rotated +90 degrees about the X-axis) to extrude.

Since a 2D shape is rendered by OpenSCAD on the X-Y plane, an alternative way to think of this operation is as follows: spins a 2D shape around the Y-axis to form a solid. The resultant solid is placed so that its axis of rotation lies along the Z-axis.

Just like the linear_extrude, the extrusion is always performed on the projection of the 2D polygon to the XY plane. Transformations like rotate, translate, etc. applied to the 2D polygon before extrusion modify the projection of the 2D polygon to the XY plane and therefore also modify the appearance of the final 3D object.

- A translation in Z of the 2D polygon has no effect on the result (as also the projection is not affected).
- A translation in X increases the diameter of the final object.
- A translation in Y results in a shift of the final object in Z direction.
- A rotation about the X or Y axis distorts the cross section of the final object, as also the projection to the XY plane is distorted.

Don't get confused, as OpenSCAD displays 2D polygons with a certain height in the Z direction, so the 2D object (with its height) appears to have a bigger projection to the XY plane. But for the projection to the XY plane and also for the later extrusion only the base polygon without height is used.

You cannot use rotate_extrude to produce a helix or screw thread. Doing this properly can be difficult, so it's best to find a thread library to make them for you.

The 2D shape must lie completely on either the right (recommended) or the left side of the Y-axis. More precisely speaking, every vertex of the shape must have either x >= 0 or x <= 0. If the shape spans the X axis a warning appears in the console windows and the rotate_extrude() is ignored. If the 2D shape touches the Y axis, i.e. at x=0, it must be a line that touches, not a point, as a point results in a zero thickness 3D object, which is invalid and results in a CGAL error. For OpenSCAD versions prior to 2016.xxxx, if the shape is in the negative axis the resulting faces are oriented inside-out, which may cause undesired effects.

#### Usage

```
rotate_extrude(angle = 360, start=0, convexity = 2) {...}
```

In 2021.01 and previous, you must use parameter names due to a backward compatibility issue.

- **angle** \[Note: Requires version 2019.05\] : Defaults to 360. Specifies the number of degrees to sweep, starting at the positive X axis. The direction of the sweep follows the Right Hand Rule, hence a negative angle sweeps clockwise.
- **start** \[Note: Requires version Development snapshot\] : Defaults to 0 if angle is specified, and 180 if not. Specifies the starting angle of the extrusion, counter-clockwise from the positive X axis.
- **convexity** : If parts of the model appear to be transparent, it may be because the preview needs a hint about the shape and you need to set the convexity parameter. 10 is a good value to try.

> Right-hand grip rule

The standard circular-resolution variables control the number of fragments used in the extrusion:

- **$fa** : minimum angle (in degrees) of each fragment.
- **$fs** : minimum circumferential length of each fragment.
- **$fn** : fixed number of fragments in 360 degrees. Values of 3 or more override $fa and $fs.

#### Examples

A simple torus can be constructed using a rotational extrude.

```openscad
rotate_extrude(convexity = 10)
translate([2, 0, 0])
circle(r = 1);
```

#### Mesh Refinement

Increasing the number of fragments composing the 2D shape improves the quality of the mesh, but takes longer to render.

```openscad
rotate_extrude(convexity = 10)
translate([2, 0, 0])
circle(r = 1, $fn = 100);
```

The number of fragments used by the extrusion can also be increased.

```openscad
rotate_extrude(convexity = 10, $fn = 100)
translate([2, 0, 0])
circle(r = 1, $fn = 100);
```

#### Extruding a Polygon

Extrusion can also be performed on polygons with points chosen by the user.

Here is a simple polygon and its 200 step rotational extrusion. (Note it has been rotated 90 degrees to show how the rotation appears; the rotate_extrude() needs it flat).

```openscad
rotate([90,0,0]) polygon( points=[[0,0],[2,1],[1,2],[1,3],[3,4],[0,5]] );
rotate_extrude($fn=200) polygon( points=[[0,0],[2,1],[1,2],[1,3],[3,4],[0,5]] );
```

For more information on polygons, please see: 2D Primitives: Polygon.

#### Combining Extrusions

Using the angle parameter \[Note: Requires version 2019.05\], a hook can be modeled.

```openscad
eps = 0.01;
translate([eps, 60, 0])
rotate_extrude(angle=270, convexity=10)
translate([40, 0]) circle(10);
rotate_extrude(angle=90, convexity=10)
translate([20, 0]) circle(10);
translate([20, eps, 0])
rotate([90, 0, 0]) cylinder(r=10, h=80+eps);
```

#### Orientation

If you're making a round 360 degree extrusion, it doesn't matter where it starts. If, on the other hand, you're using $fn to make an extrusion with some specific number of sides, it can matter. With an odd number of sides, there will be a vertex on either the left or the right, and a side opposite it.

With angle not specified, the extrusion starts along the negative X axis, to the left of the origin. With an odd number of sides, there is a vertex on the left and a side on the right. (Note that this is inconsistent with the behavior for angle less than 360, and with the behavior for circle and other round primitives.)

With angle specified, and not equal to 360, the extrusion starts along the positive X axis, to the right of the origin.

For 2021.01 and earlier, if angle is equal to 360, the extrusion starts along the negative X axis, as for angle not being specified.

For the development snapshot, if angle is 360, the extrusion starts along the positive X axis, as for other cases where angle is specified. Explicitly specifying angle=360 thus yields results consistent with other round primitives.

A future release may change this behavior so that when angle is not specified the extrusion starts along the positive X axis, making all of these cases consistent.

start directly controls the start point. \[Note: Requires version Development snapshot\]

## DXF Extrusion

With the import() and extrusion modules it is possible to convert 2D objects read from DXF files to 3D objects. See also 2D to 3D Extrusion.

### Linear Extrude

Example of linear extrusion of a 2D object imported from a DXF file.

```openscad
linear_extrude(height = fanwidth, center = true, convexity = 10)
import (file = "example009.dxf", layer = "fan_top");
```

### Rotate Extrude

Example of rotational extrusion of a 2D object imported from a DXF file.

```openscad
rotate_extrude(convexity = 10)
import (file = "example009.dxf", layer = "fan_side", origin = fan_side_center);
```

## Getting Inkscape to work

Inkscape is an open source drawing program. Tutorials for transferring 2d DXF drawings from Inkscape to OpenSCAD are available here:

- http://repraprip.blogspot.com/2011/05/inkscape-to-openscad-dxf-tutorial.html (Very simple, needs path segments to be straight lines)
- [http://tonybuser.com/?tag=inkscape](http://web.archive.org/web/20130318112610/http://tonybuser.com/?tag=inkscape) (More complicated, involves conversion to Postscript)
- http://bobcookdev.com/inkscape/inkscape-dxf.html (Better DXF Export, native support for bezier curves)
- http://www.bigbluesaw.com/saw/big-blue-saw-blog/general-updates/big-blue-saws-dxf-export-for-inkscape.html (even better support, works as of 10/29/2014, see link below registration window. Note: As of 6/17/15 only works with version 0.48.5 or earlier of inkscape, due to a breaking change made in 0.91.)
- http://www.instructables.com/id/Convert-any-2D-image-to-a-3D-object-using-OpenSCAD/ (Convert any 2D image to a 3D object using OpenSCAD)
- http://carrefour-numerique.cite-sciences.fr/fablab/wiki/doku.php?id=projets:de_inkscape_a_openscad (French, directly exports OpenSCAD file)

## CSG Export

## Other 2D formats

Previous | Next

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Using_the_2D_Subsystem&oldid=4533657"


---

# OpenSCAD User Manual — Mathematical Operators

The scalar arithmetic operators take numbers as operands and produce a new number.

## Scalar arithmetic operators

| Operator | Description |
|----------|-------------|
| `+` | add |
| `-` | subtract |
| `*` | multiply |
| `/` | divide |
| `%` | modulo |
| `^` | exponent [Note: Requires version 2021.01] |

The `-` can also be used as prefix operator to negate a number.

Prior to version 2021.01, the builtin mathematical function `pow()` is used instead of the `^` exponent operator.

**Example:**

A number modulo 2 is zero if even and one if odd.

```openscad
a=[ for(i=[0:10]) i%2 ];
echo(a);//ECHO: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
```

## Binary arithmetic

[Note: Requires version Development snapshot]

| Operator | Description |
|----------|-------------|
| `\|` | OR |
| `&` | AND |
| `<<` | Left shift |
| `>>` | Right shift (sign preserving) |
| `~` | Unary NOT |

Integer values are converted to at least 64-bit signed integers for binary arithmetic, and then converted back. Note that OpenSCAD numbers have at least 53 bits of precision; binary arithmetic exceeding 2^53 may be imprecise.

## Relational operators

Relational operators produce a boolean result from two operands.

| Operator | Description |
|----------|-------------|
| `<` | less than |
| `<=` | less or equal |
| `==` | equal |
| `!=` | not equal |
| `>=` | greater or equal |
| `>` | greater than |

If both operands are simple numbers, the meaning is self-evident.

If both operands are strings, alphabetical sorting determines equality and order. E.g., `"ab" > "aa" > "a"`.

If both operands are Booleans, `true > false`. In an inequality comparison between a Boolean and a number `true` is treated as 1 and `false` is treated as 0. Other inequality tests involving Booleans return false.

If both operands are vectors, an equality test returns true when the vectors are identical and false otherwise. Inequality tests involving one or two vectors always return false, so for example `[1] < [2]` is false.

Dissimilar types always test as unequal with `==` and `!=`. Inequality comparisons between dissimilar types, except for Boolean and numbers as noted above, always result in false. Note that `[1]` and `1` are different types so `[1] == 1` is false.

`undef` doesn't equal anything but `undef`. Inequality comparisons involving `undef` result in false.

`nan` doesn't equal anything (not even itself) and inequality tests all produce false. See Numbers.

## Logical operators

All logical operators take Booleans as operands and produce a Boolean. Non-Boolean quantities are converted to Booleans before the operator is evaluated.

| Operator | Description |
|----------|-------------|
| `&&` | logical AND |
| `\|\|` | logical OR |
| `!` | logical unary NOT |

Since `[false]` is true, `false || [false]` is also true.

Logical operators deal with vectors differently than relational operators:

- `[1, 1] > [0, 2]` is false, but
- `[false, false] && [false, false]` is true.

## Conditional operator

The `?:` operator can be used to conditionally evaluate one or another expression. It works like the `?:` operator from the family of C-like programming languages.

| Operator | Description |
|----------|-------------|
| `? :` | Conditional operator |

**Usage Example:**

If `a` equals `b`, then `c` is set to 4, else `c` is set to 5.

The part `a==b` must be something that evaluates to a boolean value.

```openscad
a=1;
b=2;
c= a==b ? 4 : 5;
```

## Vector-number operators

The vector-number operators take a vector and a number as operands and produce a new vector.

| Operator | Description |
|----------|-------------|
| `*` | multiply all vector elements by number |
| `/` | divide all vector elements by number |

**Example:**

```openscad
L = [1, [2, [3, "a"] ] ];
echo(5*L);
// ECHO: [5, [10, [15, undef]]]
```

## Vector operators

The vector operators take vectors as operands and produce a new vector.

| Operator | Description |
|----------|-------------|
| `+` | add element-wise |
| `-` | subtract element-wise |

The `-` can also be used as prefix operator to element-wise negate a vector.

**Example:**

```openscad
L1 = [1, [2, [3, "a"] ] ];
L2 = [1, [2, 3] ];
echo(L1+L1); // ECHO: [2, [4, [6, undef]]]
echo(L1+L2); // ECHO: [2, [4, undef]]
```

Using `+` or `-` with vector operands of different sizes produce a result vector that is the size of the smaller vector.

## Vector dot-product operator

If both operands of multiplication are simple vectors, the result is a number according to the linear algebra rule for dot product. `c = u*v;` results in c = Σ uᵢvᵢ. If the operands' sizes don't match, the result is `undef`.

## Matrix multiplication

If one or both operands of multiplication are matrices, the result is a simple vector or matrix according to the linear algebra rules for matrix product. In the following, A, B, C... are matrices, u, v, w... are vectors. Subscripts i, j denote element indices.

For **A** a matrix of size n × m and **B** a matrix of size m × p, their product `C = A*B;` is a matrix of size n × p with elements Cᵢⱼ = Σₖ AᵢₖBₖⱼ.

`C = B*A;` results in `undef` unless n = p.

For **A** a matrix of size n × m and **v** a vector of size m, their product `u = A*v;` is a vector of size n with elements uᵢ = Σⱼ Aᵢⱼvⱼ.

In linear algebra, this is the product of a matrix and a column vector.

For **v** a vector of size n and **A** a matrix of size n × m, their product `u = v*A;` is a vector of size m with elements uⱼ = Σᵢ vᵢAᵢⱼ.

In linear algebra, this is the product of a row vector and a matrix.

Matrix multiplication is not commutative: A*B ≠ B*A, A*v ≠ v*A.

---

# OpenSCAD User Manual — Mathematical Functions

The trig functions use the C Language mathematics functions, which are based in turn on Binary Floating Point mathematics, which use approximations of Real Numbers during calculation. OpenSCAD's math functions use the C++ 'double' type, inside Value.h/Value.cc.

A good resource for the specifics of the C library math functions, such as valid inputs/output ranges, can be found at the Open Group website [math.h](http://pubs.opengroup.org/onlinepubs/009695399/basedefs/math.h.html) & [acos](http://pubs.opengroup.org/onlinepubs/009695399/functions/acos.html)

## Trigonometric functions

### cos

Mathematical cosine function of degrees. See Cosine

**Parameters**

- `<degrees>` — Decimal. Angle in degrees.

**Usage example:**

```openscad
for(i=[0:36])
  translate([i*10,0,0])
    cylinder(r=5,h=cos(i*10)*50+60);
```

### sin

Mathematical sine function. See Sine

**Parameters**

- `<degrees>` — Decimal. Angle in degrees.

**Usage example 1:**

```openscad
for (i = [0:5]) {
  echo(360*i/6, sin(360*i/6)*80, cos(360*i/6)*80);
  translate([sin(360*i/6)*80, cos(360*i/6)*80, 0 ])
    cylinder(h = 200, r=10);
}
```

**Usage example 2:**

```openscad
for(i=[0:36])
  translate([i*10,0,0])
    cylinder(r=5,h=sin(i*10)*50+60);
```

### tan

Mathematical tangent function. See Tangent

**Parameters**

- `<degrees>` — Decimal. Angle in degrees.

**Usage example:**

```openscad
for (i = [0:5]) {
  echo(360*i/6, tan(360*i/6)*80);
  translate([tan(360*i/6)*80, 0, 0 ])
    cylinder(h = 200, r=10);
}
```

### acos

Mathematical arccosine, or inverse cosine, expressed in degrees. See: Inverse trigonometric functions

### asin

Mathematical arcsine, or inverse sine, expressed in degrees. See: Inverse trigonometric functions

### atan

Mathematical arctangent, or inverse tangent, function. Returns the principal value of the arc tangent of x, expressed in degrees. `atan` cannot distinguish between y/x and -y/-x and returns angles from -90 to +90. See: atan2 and also Inverse trigonometric functions

### atan2

Mathematical two-argument atan function `atan2(y,x)` that spans the full 360 degrees. This function returns the full angle between the x axis and the vector(x,y) expressed in degrees, in the range (−180, 180].

**Usage examples:**

```openscad
atan2(5.0,-5.0);   //result: 135 degrees. atan() would give -45
atan2(y,x);        //angle between (1,0) and (x,y) = angle around z-axis
```

## Other Mathematical Functions

### abs

Mathematical absolute value function. Returns the positive value of a signed decimal number.

**Usage examples:**

```openscad
abs(-5.0); // returns 5.0
abs(0);    // returns 0.0
abs(8.0);  // returns 8.0
```

### ceil

Mathematical ceiling function.

Returns the next highest integer value by rounding up value if necessary.

See: Ceil Function

```openscad
echo(ceil(4.4),ceil(-4.4));   // produces ECHO: 5, -4
```

### concat

[Note: Requires version 2015.03]

Return a new vector that is the result of appending the elements of the supplied vectors.

Where an argument is a vector the elements of the vector are individually appended to the result vector. Strings are distinct from vectors in this case.

**Usage examples:**

```openscad
echo(concat("a","b","c","d","e","f"));       // produces ECHO: ["a", "b", "c", "d", "e", "f"]
echo(concat(["a","b","c"],["d","e","f"]));    // produces ECHO: ["a", "b", "c", "d", "e", "f"]
echo(concat(1,2,3,4,5,6));                   // produces ECHO: [1, 2, 3, 4, 5, 6]
```

**Vector of vectors:**

```openscad
echo(concat([ [1],[2] ], [ [3] ]));          // produces ECHO: [[1], [2], [3]]
```

Note: All vectors passed to the function lose one nesting level. When adding something like a single element [x, y, z] tuples (which are vectors, too), the tuple needs to be enclosed in a vector (i.e. an extra set of brackets) before the concatenation. In the example below, a fourth point is added to the polygon path, which used to resemble a triangle, making it a square now:

```openscad
polygon(concat([[0,0],[0,5],[5,5]], [[5,0]]));
```

**Contrast with strings:**

```openscad
echo(concat([1,2,3],[4,5,6]));   // produces ECHO: [1, 2, 3, 4, 5, 6]
echo(concat("abc","def"));       // produces ECHO: ["abc", "def"]
echo(str("abc","def"));          // produces ECHO: "abcdef"
```

### cross

Calculates the cross product of two vectors in 3D or 2D space. If both vectors are in the 3D, the result is a vector that is perpendicular to both of the input vectors. If both vectors are in 2D space, their cross product has the form [0,0,z] and the cross function returns just the z value of the cross product:

```
cross([x,y], [u,v]) = x*v - y*u
```

Note that this is the determinant of the 2×2 matrix [[x,y],[u,v]]. Using any other types, vectors with lengths different from 2 or 3, or vectors not of the same length produces 'undef'.

**Usage examples:**

```openscad
echo(cross([2, 3, 4], [5, 6, 7]));    // produces ECHO: [-3, 6, -3]
echo(cross([2, 1, -3], [0, 4, 5]));   // produces ECHO: [17, -10, 8]
echo(cross([2, 1], [0, 4]));          // produces ECHO: 8
echo(cross([1, -3], [4, 5]));         // produces ECHO: 17
echo(cross([2, 1, -3], [4, 5]));      // produces ECHO: undef
echo(cross([2, 3, 4], "5"));          // produces ECHO: undef
```

For any two vectors **a** and **b** in 2D or in 3D, the following holds:

```
cross(a,b) == -cross(b,a)
```

### exp

Mathematical exp function. Returns the base-e exponential function of x, which is the number e raised to the power x. See: Exponent

```openscad
echo(exp(1),exp(ln(3)*4)); // produces ECHO: 2.71828, 81
```

### floor

Mathematical floor function. `floor(x)` = is the largest integer not greater than x

See: Floor Function

```openscad
echo(floor(4.4),floor(-4.4)); // produces ECHO: 4, -5
```

### ln

Mathematical natural logarithm. See: Natural logarithm

### len

Mathematical length function. Returns the length of an array, a vector or a string parameter.

**Usage examples:**

```openscad
str1="abcdef"; len_str1=len(str1);
echo(str1,len_str1);

a=6; len_a=len(a);
echo(a,len_a);

array1=[1,2,3,4,5,6,7,8]; len_array1=len(array1);
echo(array1,len_array1);

array2=[[0,0],[0,1],[1,0],[1,1]]; len_array2=len(array2);
echo(array2,len_array2);

len_array2_2=len(array2[2]);
echo(array2[2],len_array2_2);
```

**Results:**

```
WARNING: len() parameter could not be converted in file , line 4
ECHO: "abcdef", 6
ECHO: 6, undef
ECHO: [1, 2, 3, 4, 5, 6, 7, 8], 8
ECHO: [[0, 0], [0, 1], [1, 0], [1, 1]], 4
ECHO: [1, 0], 2
```

This function allows (e.g.) the parsing of an array, a vector or a string.

**Usage examples:**

```openscad
str2="4711";
for (i=[0:len(str2)-1])
  echo(str("digit ",i+1," : ",str2[i]));
```

**Results:**

```
ECHO: "digit 1 : 4"
ECHO: "digit 2 : 7"
ECHO: "digit 3 : 1"
ECHO: "digit 4 : 1"
```

Note that the `len()` function is not defined and raises a warning when a simple variable is passed as the parameter.

This is useful when handling parameters to a module, similar to how shapes can be defined as a single number, or as an [x,y,z] vector; i.e. `cube(5)` or `cube([5,5,5])`

**For example:**

```openscad
module doIt(size) {
  if (len(size) == undef) {
    // size is a number, use it for x,y & z. (or could be undef)
    do([size,size,size]);
  } else {
    // size is a vector, (could be a string but that would be stupid)
    do(size);
  }
}
doIt(5);       // equivalent to [5,5,5]
doIt([5,5,5]); // similar to cube(5) v's cube([5,5,5])
```

### let

[Note: Requires version 2015.03]

Sequential assignment of variables inside an expression. The following expression is evaluated in context of the let assignments and can use the variables. This is mainly useful to make complicated expressions more readable by assigning interim results to variables.

**Parameters**

```
let (var1 = value1, var2 = f(var1), var3 = g(var1, var2)) expression
```

**Usage example:**

```openscad
echo(let(a = 135, s = sin(a), c = cos(a)) [ s, c ]); // ECHO: [0.707107, -0.707107]
```

Let can also be used to create variables in a Function. (See also: "Let Statement")

### log

Mathematical logarithm to the base 10. Example: `log(1000) = 3`. See: Logarithm

### lookup

Look up value in table, and linearly interpolate if there's no exact match. The first argument is the value to look up. The second is the lookup table -- a vector of key-value pairs.

**Parameters**

- `key` — A lookup key
- `<key,value> array` — keys and values

There is a bug in which out-of-range keys return the first value in the list. Newer versions of OpenSCAD should use the top or bottom end of the table as appropriate instead.

**Usage example:** Create a 3D chart made from cylinders of different heights.

```openscad
function get_cylinder_h(p) = lookup(p, [
  [ -200, 5 ],
  [ -50, 20 ],
  [ -20, 18 ],
  [ +80, 25 ],
  [ +150, 2 ]
]);

for (i = [-100:5:+100]) {
  // echo(i, get_cylinder_h(i));
  translate([ i, 0, -30 ]) cylinder(r1 = 6, r2 = 2, h = get_cylinder_h(i)*3);
}
```

### max

Returns the maximum of the parameters. If a single vector is given as parameter, returns the maximum element of that vector.

**Parameters**

```
max(n,n{,n}...)
max(vector)
```

- `<n>` — Two or more decimals
- `<vector>` — Single vector of decimals [Note: Requires version 2014.06].

**Usage example:**

```openscad
max(3.0,5.0)
max(8.0,3.0,4.0,5.0)
max([8,3,4,5])
```

**Results:**

```
5
8
8
```

### min

Returns the minimum of the parameters. If a single vector is given as parameter, returns the minimum element of that vector.

**Parameters**

```
min(n,n{,n}...)
min(vector)
```

- `<n>` — Two or more decimals
- `<vector>` — Single vector of decimals [Note: Requires version 2014.06].

**Usage example:**

```openscad
min(3.0,5.0)
min(8.0,3.0,4.0,5.0)
min([8,3,4,5])
```

**Results:**

```
3
3
3
```

### mod

Does not exist as a function; included in this document only for clarity.

The 'modulo' operation exists in OpenSCAD as an operator `%`, and not as function. See modulo operator (%).

### norm

Returns the Euclidean norm of a vector:

This returns the actual numeric length while `len()` returns the number of elements in the vector or array.

**Usage examples:**

```openscad
a=[1,2,3,4,5,6];
b="abcd";
c=[];
d="";
e=[[1,2,3,4],[1,2,3],[1,2],[1]];
echo(norm(a)); //9.53939
echo(norm(b)); //undef
echo(norm(c)); //0
echo(norm(d)); //undef
echo(norm(e[0])); //5.47723
echo(norm(e[1])); //3.74166
echo(norm(e[2])); //2.23607
echo(norm(e[3])); //1
```

**Results:**

```
ECHO: 9.53939
ECHO: undef
ECHO: 0
ECHO: undef
ECHO: 5.47723
ECHO: 3.74166
ECHO: 2.23607
ECHO: 1
```

### pow

Mathematical power function.

As of version 2021.01 you can use the exponentiation operator `^` instead.

**Parameters**

- `<base>` — Decimal. Base.
- `<exponent>` — Decimal. Exponent.

**Usage examples:**

```openscad
for (i = [0:5]) {
  translate([i*25,0,0]) {
    cylinder(h = pow(2,i)*5, r=10);
    echo (i, pow(2,i));
  }
}

echo(pow(10,2)); // means 10^2 or 10*10
// result: ECHO: 100

echo(pow(10,3)); // means 10^3 or 10*10*10
// result: ECHO: 1000

echo(pow(125,1/3)); // means 125^(0.333...), which calculates the cube root of 125
// result: ECHO: 5
```

### rands

Random number generator. Generates a constant vector of pseudo random numbers, much like an array. The numbers are doubles not integers. When generating only one number, you still call it with `variable[0]`.

The random numbers generated are a "half open interval"; each is greater than or equal to the minimum, and less than the maximum.

**Parameters**

- `min_value` — Minimum value of random number range
- `max_value` — Maximum value of random number range
- `value_count` — Number of random numbers to return as a vector
- `seed_value` (optional) — Seed value for random number generator for repeatable results. On versions before late 2015, seed_value gets rounded to the nearest integer.

**Usage examples:**

```openscad
// get a single number
single_rand = rands(0,10,1)[0];
echo(single_rand);

// get a vector of 4 numbers
seed=42;
random_vect=rands(5,15,4,seed);
echo( "Random Vector: ",random_vect);
sphere(r=5);
for(i=[0:3]) {
  rotate(360*i/4) {
    translate([10+random_vect[i],0,0])
      sphere(r=random_vect[i]/2);
  }
}
// ECHO: "Random Vector: ", [8.7454, 12.9654, 14.5071, 6.83435]

// Get a vector of integers between 1 and 10 inclusive.
// Note that rands(1,10,...) only spans 9 numbers and so it is difficult to get it to yield equal
// probabilities for 1..10 inclusive. We widen the range by 1 so that we have the right number
// of intervals.
function irands(minimum, maximum, n) =
  let(floats = rands(minimum, maximum+1, n))
  [ for (f = floats) floor(f) ];

echo(irands(1, 10, 5));
// ECHO: [9, 6, 2, 4, 1]
```

### round

The "round" operator returns the greatest or least integer part, respectively, if the numeric input is positive or negative.

**Usage examples:**

```openscad
round(5.4);
round(5.5);
round(5.6);
round(-5.4);
round(-5.5);
round(-5.6);
```

**Results:**

```
5
6
6
-5
-6
-6
```

### sign

Mathematical signum function. Returns a unit value that extracts the sign of a value. See: Signum function

**Parameters**

- `<x>` — Decimal. Value to find the sign of.

**Usage examples:**

```openscad
sign(-5.0);
sign(0);
sign(8.0);
```

**Results:**

```
-1.0
0.0
1.0
```

### sqrt

Mathematical square root function.

**Usage example:**

```openscad
translate([sqrt(100),0,0])sphere(100);
```

## Infinities and NaNs

How does OpenSCAD deal with inputs like (1/0)? Basically, the behavior is inherited from the language OpenSCAD was written in, the C++ language, and its floating point number types and the associated C math library. This system allows representation of both positive and negative infinity by the special values "Inf" or "-Inf". It also allows representation of creatures like sqrt(-1) or 0/0 as "NaN", an abbreviation for "Not A Number". Explanations can be found on the web, for example the Open Group's site on [math.h](http://pubs.opengroup.org/onlinepubs/009695399/basedefs/math.h.html) or Wikipedia's page on the IEEE 754 number format. However, OpenSCAD is its own language so it may not exactly match everything that happens in C. For example, OpenSCAD uses degrees instead of radians for trigonometric functions. Another example is that `sin()` does not throw a "domain error" when the input is 1/0, although it does return NaN.

Here are some examples of infinite input to OpenSCAD math functions and the resulting output, taken from OpenSCAD's regression test system in late 2015.

```
 0/0:  nan       sin(1/0):  nan    asin(1/0):  nan     ln(1/0):  inf     round(1/0):  inf
-0/0:  nan       cos(1/0):  nan    acos(1/0):  nan     ln(-1/0): nan     round(-1/0): -inf
 0/-0: nan       tan(1/0):  nan    atan(1/0):  90      log(1/0): inf     sign(1/0):   1
 1/0:  inf       ceil(-1/0):-inf   atan(-1/0): -90     log(-1/0):nan     sign(-1/0):  -1
 1/-0: -inf      ceil(1/0): inf    atan2(1/0, -1/0):135 max(-1/0, 1/0):inf sqrt(1/0):  inf
-1/0:  -inf      floor(-1/0):-inf  exp(1/0):   inf     min(-1/0, 1/0):-inf sqrt(-1/0): nan
-1/-0: inf       floor(1/0):inf    exp(-1/0):  0       pow(2, 1/0):inf    pow(2, -1/0):0
```

---

# OpenSCAD User Manual — String Functions

### str

Convert all arguments to strings and concatenate.

**Usage examples:**

```openscad
number=2;
echo ("This is ",number,3," and that's it.");
echo (str("This is ",number,3," and that's it."));
```

**Results:**

```
ECHO: "This is ", 2, 3, " and that's it."
ECHO: "This is 23 and that's it."
```

This can be used for simple conversion of numbers to strings:

```openscad
s = str(n);
```

### chr

[Note: Requires version 2015.03]

Convert numbers to a string containing character with the corresponding code. OpenSCAD uses Unicode, so the number is interpreted as Unicode code point. Numbers outside the valid code point range produce an empty string.

**Parameters**

- `chr(Number)` — Convert one code point to a string of length 1 (number of bytes depending on UTF-8 encoding) if the code point is valid.
- `chr(Vector)` — Convert all code points given in the argument vector to a string.
- `chr(Range)` — Convert all code points produced by the range argument to a string.

**Examples:**

Note: When used with `echo()` the output to the console for character codes greater than 127 is platform dependent.

```openscad
echo(chr(65), chr(97));      // ECHO: "A", "a"
echo(chr(65, 97));           // ECHO: "Aa"
echo(chr([66, 98]));         // ECHO: "Bb"
echo(chr([97 : 2 : 102]));  // ECHO: "ace"
echo(chr(-3));               // ECHO: ""
echo(chr(9786), chr(9788));  // ECHO: "☺", "☼"
echo(len(chr(9788)));        // ECHO: 1
```

### ord

[Note: Requires version 2019.05]

Convert a character to a number representing the [Unicode](https://en.wikipedia.org/wiki/Unicode) [code point](https://en.wikipedia.org/wiki/Code_point). If the parameter is not a string, the `ord()` returns undef.

**Parameters**

- `ord(String)` — Convert the first character of the given string to a Unicode code point.

**Examples:**

```openscad
echo(ord("a"));
// ECHO: 97

echo(ord("BCD"));
// ECHO: 66

echo([for (c = "Hello! 🙂") ord(c)]);
// ECHO: [72, 101, 108, 108, 111, 33, 32, 128578]

txt="1";
echo(ord(txt)-48,txt);
// ECHO: 1,"1" // only converts 1 character
```

### len

Returns the number of characters in a text.

```openscad
echo(len("Hello world")); // 11
```

Also See `search()` for text searching.

### is_string(value)

The function `is_string(value)` returns true if the value is a string, false otherwise.

```openscad
echo(is_string("alpha")); //true
echo(is_string(22));       //false
```

### User defined functions

To complement native functions, you can define your own functions, some suggestions:

Note here the use of `chr()` to recompose a string from unknown number of characters defined by their ascii code. This avoids using recursive modules as was required before list management came in.

```openscad
//-- Lower case all chars of a string -- does not work with accented characters
function strtolower (string) =
  chr([for(s=string) let(c=ord(s)) c<91 && c>64 ?c+32:c]);

//-- Replace char(not string) in a string
function char_replace (s,old=" ",new="_") =
  chr([for(i=[0:len(s)-1]) s[i]==old?ord(new):ord(s[i])]);

//-- Replace last chars of a string (can be used for file extension replacement of same length)
function str_rep_last (s,new=".txt") =
  str(chr([for(i=[0 :len(s)-len(new)-1])ord(s[i])]),new);

//-- integer value from string ----------
//Parameters ret and i are for function internal use (recursion)
function strtoint (s, ret=0, i=0) =
  i >= len(s)
  ? ret
  : strtoint(s, ret*10 + ord(s[i]) - ord("0"), i+1);
```

---

# OpenSCAD User Manual — Type Test Functions

[Note: Requires version 2019.05]

### is_undef

`is_undef` accepts one parameter. If the parameter is `undef`, this function returns `true`. If the parameter is not `undef`, it returns `false`. When checking a variable (like `is_undef(a)`), it does the variable lookup silently, meaning that `is_undef(a)` does not cause `WARNING: Ignoring unknown variable 'a'.`

The alternative is code like this:

```openscad
if(a==undef){
  //code goes here
}
```

or

```openscad
b = (a==undef) ? true : false;
```

causes

```
WARNING: Ignoring unknown variable 'a'.
```

`is_undef` also works for special variables, allowing for things like this:

```openscad
exploded = is_undef($exploded) ? 0 : $exploded; // 1 for exploded view
```

For older OpenSCAD version, `is_undef` can be emulated with

**legacy support:**

```openscad
function is_undef ( a ) = (undef == a) ;
```

which of course causes warning(s), but requires no changes to code relying on `is_undef()`.

### is_list

[Note: Requires version 2019.05]

```openscad
echo("returning true");
echo(is_list([]));
echo(is_list([1]));
echo(is_list([1,2]));
echo(is_list([true]));
echo(is_list([1,2,[5,6],"test"]));

echo("--------");
echo("returning false");
echo(is_list(1));
echo(is_list(1/0));
echo(is_list(((1/0)/(1/0))));
echo(is_list("test"));
echo(is_list(true));
echo(is_list(false));

echo("--------");
echo("causing warnings:");
echo(is_list());
echo(is_list(1,2));
```

### is_num

[Note: Requires version 2019.05]

```openscad
echo("a number is a number:");
echo(is_num(0.1));
echo(is_num(1));
echo(is_num(10));

echo("inf is a number:");
echo(is_num(+1/0)); //+inf
echo(is_num(-1/0)); //-inf

echo("nan is not a number:");
echo(is_num(0/0)); //nan
echo(is_num((1/0)/(1/0))); //nan

echo("resulting in false:");
echo(is_num([]));
echo(is_num([1]));
echo(is_num("test"));
echo(is_num(false));
echo(is_num(undef));
```

### is_bool

[Note: Requires version 2019.05]

```openscad
echo("resulting in true:");
echo(is_bool(true));
echo(is_bool(false));

echo("resulting in false:");
echo(is_bool([]));
echo(is_bool([1]));
echo(is_bool("test"));
echo(is_bool(0.1));
echo(is_bool(1));
echo(is_bool(10));
echo(is_bool(0/0)); //nan
echo(is_bool((1/0)/(1/0))); //nan
echo(is_bool(1/0)); //inf
echo(is_bool(-1/0)); //-inf
echo(is_bool(undef));
```

### is_string

[Note: Requires version 2019.05]

```openscad
echo("resulting in true:");
echo(is_string(""));
echo(is_string("test"));

echo("resulting in false:");
echo(is_string(0.1));
echo(is_string(1));
echo(is_string(10));
echo(is_string([]));
echo(is_string([1]));
echo(is_string(false));
echo(is_string(0/0)); //nan
echo(is_string((1/0)/(1/0))); //nan
echo(is_string(1/0)); //inf
echo(is_string(-1/0)); //-inf
echo(is_string(undef));
```

### is_function

[Note: Requires version 2021.01]

The `is_function` check works only for expressions, so it can be applied to function literals or variables containing functions. It does not work with built-in functions or normal function definitions.

```openscad
echo(is_function(function(x) x*x)); // ECHO: true

func = function(x) x+x;
echo(is_function(func)); // ECHO: true

function f(x) = x;
echo(is_function(f)); // WARNING: Ignoring unknown variable 'f' / ECHO: false
```

### is_object

[Note: Requires version Development snapshot]

Returns true if the argument is an object, and false otherwise.


---

# OpenSCAD User Manual — Conditional and Iterator Functions, List Comprehensions, and User-Defined Functions and Modules

---

# OpenSCAD User Manual/Conditional and Iterator Functions

## For Loop

Evaluate each value in a range or vector, or each name in an object, applying it to the following Action.

```
for(variable = [start : increment : end])
for(variable = [start : end])
for(variable = [vector])
for(variable = object)
```

```
for (variable = [ start : increment : end ])
for (variable = [ start : end ])
```

> **Note:** For range, values are separated by colons rather than commas used in vectors.

### For each value in a range

The Action is evaluated for each value in the range.

- **start** - initial value
- **increment** or **step** - amount to increase the value, optional, default = 1
- **end** - stop when next value would be past end

examples:

```openscad
for (a =[3:5])echo(a);          // 3 4 5
for (a =[3:0]){echo(a);}        // 0 1 2 3     start > end is invalid, deprecated by 2015.3
for (a =[3:0.5:5])echo(a);      // 3 3.5 4 4.5 5
for (a =[0:2:5])echo(a);        // 0 2 4        a never equals end
for (a =[3:-2:-1])echo(a);      // 3 1 -1       negative increment requires 2015.3
                                 // be sure end < start
```

### For each element of a vector

The Action is evaluated for each element of the vector.

```openscad
for (a =[3,4,1,5])echo(a);                          // 3 4 1 5
for (a =[0.3,PI,1,99]){echo(a);}                    // 0.3 3.14159 1 99
x1=2; x2=8; x3=5.5;
for (a =[x1,x2,x3]){echo(a);}                       // 2 8 5.5
for (a =[[1,2],6,"s",[[3,4],[5,6]]])echo(a);        // [1,2] 6 "s" [[3,4],[5,6]]
```

The vector can be described elsewhere, like 'for each' in other languages.

```openscad
animals = ["elephants", "snakes", "tigers", "giraffes"];
for(animal = animals)
    echo(str("I've been to the zoo and saw ", animal));
// "I've been to the zoo and saw elephants", for each animal
```

### For each element of an object

[Note: Requires version Development snapshot]

The Action is evaluated for the name of each element of the object, in an unspecified order.

```openscad
tm = textmetrics("Hello, World!");
for (name = tm) echo(name, tm[name]);
```

### Notes

`for()` is an Operator. Operators require braces `{}` if more than one Action is within its scope. Actions end in semicolons, Operators do not.

`for()` is not an exception to the rule about variables having only one value within a scope. Each evaluation is given its own scope, allowing any variables to have unique values. No, you still can't do `a=a+1;`

Remember this is not an iterative language, the `for()` does not loop in the programmatic sense, it builds a tree of objects one branch for each item in the range/vector, inside each branch the 'variable' is a specific and separate instantiation or scope.

Hence:

```openscad
for (i=[0:3])
    translate([i*10,0,0])
        cube(i+1);
```

Produces: [See Design/Display-CSG-Tree menu]

```
group() {
    group() {
        multmatrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
            cube(size = [1, 1, 1], center = false);
        }
        multmatrix([[1, 0, 0, 10], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
            cube(size = [2, 2, 2], center = false);
        }
        multmatrix([[1, 0, 0, 20], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
            cube(size = [3, 3, 3], center = false);
        }
        multmatrix([[1, 0, 0, 30], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) {
            cube(size = [4, 4, 4], center = false);
        }
    }
}
```

While the `group()` is built sequentially, all instances of the `for()` exist as separate entities, they do not iterate one piece of code sequentially.

### Nested for()

While it is reasonable to nest multiple `for()` statements such as:

```openscad
for(z=[-180:45:+180])
    for(x=[10:5:50])
        rotate([0,0,z]) translate([x,0,0]) cube(1);
```

instead, all ranges/vectors can be included in the same `for()` operator.

```
for ( variable1 = <range or vector> , variable2 = <range or vector> ) <do something using both variables>
```

example `for()` nested 3 deep

```openscad
color_vec = ["black","red","blue","green","pink","purple"];
for (x = [-20:10:20] )
    for (y = [0:4] )color(color_vec[y])
        for (z = [0,4,10] )
            {translate([x,y*5-10,z])cube();}
```

shorthand nesting for same result

```openscad
color_vec = ["black","red","blue","green","pink","purple"];
for (x = [-20:10:20],
     y = [0:4],
     z = [0,4,10] )
    translate([x,y*5-10,z]){color(color_vec[y])cube();}
```

### Examples using vector of vectors

**example 1** - iteration over a vector of vectors (rotation)

```openscad
for(i = [ [  0,  0,   0],
           [ 10, 20, 300],
           [200, 40,  57],
           [ 20, 88,  57] ])
{
    rotate(i)
    cube([100, 20, 20], center = true);
}
```

**example 2** - iteration over a vector of vectors (translation)

```openscad
for(i = [ [ 0,  0,  0],
           [10, 12, 10],
           [20, 24, 20],
           [30, 36, 30],
           [20, 48, 40],
           [10, 60, 50] ])
{
    translate(i)
    cube([50, 15, 10], center = true);
}
```

**example 3** - iteration over a vector of vectors

```openscad
for(i = [ [[ 0,  0,  0], 20],
           [[10, 12, 10], 50],
           [[20, 24, 20], 70],
           [[30, 36, 30], 10],
           [[20, 48, 40], 30],
           [[10, 60, 50], 40] ])
{
    translate([i[0][0], 2*i[0][1], 0])
    cube([10, 15, i[1]]);
}
```

## Intersection For Loop

Iterate over the values in a range or vector and create the intersection of objects created by each pass.

Besides creating separate instances for each pass, the standard `for()` also groups all these instances creating an implicit union. `intersection_for()` is a work around because the implicit union prevents getting the expected results using a combination of the standard `for()` and `intersection()` statements.

`intersection_for()` uses the same parameters, and works the same as a For Loop, other than replacing the implicit union with an intersection.

**example 1** - loop over a range:

```openscad
intersection_for(n = [1 : 6])
{
    rotate([0, 0, n * 60])
    {
        translate([5,0,0])
        sphere(r=12);
    }
}
```

**example 2** - rotation:

```openscad
intersection_for(i = [ [  0,  0,   0],
                        [ 10, 20, 300],
                        [200, 40,  57],
                        [ 20, 88,  57] ])
{
    rotate(i)
    cube([100, 20, 20], center = true);
}
```

| `intersection_for()` | `intersection() for()` |
| --- | --- |

## If Statement

Performs a test to determine if the actions in a sub scope should be performed or not.

**REALLY IMPORTANT.** You can't change the value of Variables. If you have an assignment inside brackets, it creates a new variable that is lost as soon as you exit that scope.

```
if (test) scope1
if (test){scope1}
if (test) scope1 else scope2
if (test){scope1} else {scope2}
```

**Parameters**

- **test**: Usually a boolean expression, but can be any value or variable.
  - See here for true or false state of values.
  - See here for boolean and logical operators
  - Do not confuse the assignment operator `=` with the equal operator `==`
- **scope1**: one or more actions to take when test is true.
- **scope2**: one or more actions to take when test is false.

```openscad
if (b==a)            cube(4);
if (b<a)             {cube(4); cylinder(6);}
if (b&&a)            {cube(4); cylinder(6);}
if (b!=a)            cube(4); else cylinder(3);
if (b)               {cube(4); cylinder(6);} else {cylinder(10,5,5);}
if (!true)           {cube(4); cylinder(6);} else cylinder(10,5,5);
if (x>y)             cube(1, center=false); else {cube(size = 2, center = true);}
if (a==4)            {}          else echo("a is not 4");
if ((b<5)&&(a>8))    {cube(4);}  else {cylinder(3);}
if (b<5&&a>8)        cube(4);    else cylinder(3);
```

Since 2015.03 variables can now be assigned in any scope. Note that assignments are only valid within the scope in which they are defined - you are still not allowed to leak values to an outer scope. See Scope of variables for more details.

### Nested if

The scopes of both the `if()` portion and the `else` portion, can in turn contain `if()` statements. This nesting can be to any depth.

```openscad
if (test1)
{
    scope1 if (test2) {scope2.1}
    else {scope2.2}
}
else
{
    scope2 if (test3) {scope3.1}
    else {scope3.2}
}
```

When scope1 and scope2 contain only the `if()` statement, the outer sets of braces can be removed.

```openscad
if (test1)
    if (test2) {scope2.1}
    else {scope2.2}
else
    if (test3) {scope3.1}
    else {scope3.2}
```

### else if

One evolution is this:

```openscad
if(test1)      {scope1}
else if(test2) {scope2}
else if(test3) {scope3}
else if(test4) {scope4}
else           {scope5}
```

Note that `else` and `if` are two separate words. When working down the chain of tests, the first true uses its scope. All further tests are skipped.

example

```openscad
if((k<8)&&(m>1))     cube(10);
else if(y==6)        {sphere(6);cube(10);}
else if(y==7)        color("blue")sphere(5);
else if(k+m!=8)      {cylinder(15,5,0);sphere(8);}
else                 color("green"){cylinder(12,5,0);sphere(8);}
```

## Conditional ? :

A ternary function that uses a test to determine which of 2 values to return.

```
a = test ? TrueValue : FalseValue ;
echo( test ? TrueValue : FalseValue );
```

**Parameters**

- **test**: Usually a boolean expression, but can be any value or variable.
  - See here for true or false state of values.
  - See here for boolean and logical operators
  - Do not confuse assignment `=` with equal `==`
- **TrueValue**: the value to return when test is true.
- **FalseValue**: the value to return when test is false.

A value in OpenSCAD is either a Number (like `42`), a Boolean (like `true`), a String (like `"foo"`), a Vector (like `[1,2,3]`), or the Undefined value (`undef`). Values can be stored in variables, passed as function arguments, and returned as function results.

This works like the `?:` operator from the family of C-like programming languages.

**Examples**

```openscad
a=1; b=2; c= a==b ? 4 : 5 ;                           // 5
a=1; b=2; c= a==b ? "a==b" : "a!=b" ;                  // "a!=b"

TrueValue = true; FalseValue = false;
a=5; test = a==1;
echo( test ? TrueValue : FalseValue );                  // false

L = 75; R = 2; test = (L/R)>25;
TrueValue = [test,L,R,L/R,cos(30)];
FalseValue = [test,L,R,sin(15)];
a1 = test ? TrueValue : FalseValue ;                    // [true, 75, 2, 37.5, 0.866025]
```

Some forms of tail-recursion elimination are supported.

### Recursive function calls

Recursive function calls are supported. Using the Conditional "... ? ... : ... " it's possible to ensure the recursion is terminated. Note: There is a built-in recursion limit to prevent an application crash. If the limit is hit, the function returns undef.

example

```openscad
// recursion - find the sum of the values in a vector (array) by calling itself
// from the start (or s'th element) to the i'th element - remember elements are zero based

function sumv(v, i, s = 0) = (i == s ? v[i] : v[i] + sumv(v, i-1, s));

vec=[ 10, 20, 30, 40 ];
echo("sum vec=", sumv(vec, 2, 1)); // calculates 20+30=50
```

### Formatting complex usage

Multiple nested conditionals can become difficult to understand. Formatting them like multi-line indented "if/else" statements is clearer.

```openscad
// find the maximum value in a vector
function maxv(v, m=-999999999999, i=0) =
    (i == len(v) )
    ?   m
    :   (m > v[i])
        ? maxv(v, m, i+1)
        : maxv(v, v[i], i+1);

v=[7,3,9,3,5,6];
echo("max",maxv(v)); // ECHO: "max", 9
```

## Assign Statement

[Deprecated: `assign()` is deprecated and will be removed in a future release. Use Variables can now be assigned anywhere. If you prefer this way of setting values, the new Let Statement can be used instead. instead.]

Set variables to a new value for a sub-tree.

**Parameters**

The variables that should be (re-)assigned

example:

```openscad
for (i = [10:50])
{
    assign (angle = i*360/20, distance = i*10, r = i*2)
    {
        rotate(angle, [1, 0, 0])
        translate([0, distance, 0])
        sphere(r = r);
    }
}
```

```openscad
for (i = [10:50])
{
    angle = i*360/20;
    distance = i*10;
    r = i*2;
    rotate(angle, [1, 0, 0])
    translate([0, distance, 0])
    sphere(r = r);
}
```

## Let Statement

[Note: Requires version 2019.05]

Set variables to a new value for a sub-tree. The parameters are evaluated sequentially and may depend on each other (as opposed to the deprecated `assign()` statement).

**Parameters**

The variables that should be set

example:

```openscad
for (i = [10:50])
{
    let (angle = i*360/20, r= i*2, distance = r*5)
    {
        rotate(angle, [1, 0, 0])
        translate([0, distance, 0])
        sphere(r = r);
    }
}
```

---

# OpenSCAD User Manual/List Comprehensions

[Note: Requires version 2015.03]

The list comprehensions provide a flexible way to generate lists using the general syntax

```
[ list-definition expression ]
```

The following elements are supported to construct the list definition

| Element | Description |
| --- | --- |
| `for (i = sequence)` | Iteration over a range or an existing list |
| `for (init;condition;next)` | Simple recursive call represented as C-style for |
| `each` | Takes a sequence value as argument, and adds each element to the list being constructed. `each x` is equivalent to `for (i = x) i` |
| `if (condition)` | Selection criteria, when true the expression is calculated and added to the result list |
| `let (x = value)` | Local variable assignment |

## Basic Syntax

### multiple generator expressions

[Note: Requires version 2019.05]

The list comprehension syntax is generalized to allow multiple expressions. This allows to easily construct lists from multiple sub lists generated by different list comprehension expressions avoiding `concat`.

```openscad
steps = 50;
points = [
    // first expression generating the points in the positive Y quadrant
    for (a = [0 : steps]) [ a, 10 * sin(a * 360 / steps) + 10 ],
    // second expression generating the points in the negative Y quadrant
    for (a = [steps : -1 : 0]) [ a, 10 * cos(a * 360 / steps) - 20 ],
    // additional list of fixed points
    [ 10, -3 ], [ 3, 0 ], [ 10, 3 ]
];
polygon(points);
```

## for

The `for` element defines the input values for the list generation. The syntax is the same as used by the for iterator. The sequence to the right of the equals sign can be any list. The `for` element iterates over all the members of the list. The variable on the left of the equals sign take on the value of each member of the sequence in turn. This value can then be processed in the child of the `for` element, and each result becomes a member of the final list that is produced.

If the sequence has more than one dimension, `for` iterates over the first dimension only. Deeper dimensions can be accessed by nesting `for` elements.

Several common usage patterns are presented here.

### `[ for (i = [start : step : end]) i ]`

Generate output based on a range definition, this version is mainly useful to calculate list values or access existing lists using the range value as index.

**Examples**

```openscad
// generate a list with all values defined by a range
list1 = [ for (i = [0 : 2 : 10]) i ];
echo(list1); // ECHO: [0, 2, 4, 6, 8, 10]

// extract every second character of a string
str = "SomeText";
list2 = [ for (i = [0 : 2 : len(str) - 1]) str[i] ];
echo(list2); // ECHO: ["S", "m", "T", "x"]

// indexed list access, using function to map input values to output values
function func(x) = x < 1 ? 0 : x + func(x - 1);
input = [1, 3, 5, 8];
output = [for (a = [ 0 : len(input) - 1 ]) func(input[a]) ];
echo(output); // ECHO: [1, 6, 15, 36]
```

### `[ for (i = [a, b, c, ...]) i ]`

Use list parameter as input, this version can be used to map input values to calculated output values.

**Examples**

```openscad
// iterate over an existing list
friends = ["John", "Mary", "Alice", "Bob"];
list = [ for (i = friends) len(i)];
echo(list); // ECHO: [4, 4, 5, 3]

// map input list to output list
list = [ for (i = [2, 3, 5, 7, 11]) i * i ];
echo(list); // ECHO: [4, 9, 25, 49, 121]

// calculate Fibonacci numbers
function func(x) = x < 3 ? 1 : func(x - 1) + func(x - 2);
input = [7, 10, 12];
output = [for (a = input) func(a) ];
echo(output); // ECHO: [13, 55, 144]
```

### `[ for (c = "String") c ]`

Generate output based on a string, this iterates over each character of the string.

**Examples**

```openscad
echo([ for (c = "String") c ]);
// ECHO: ["S", "t", "r", "i", "n", "g"]
```

### `[ for (a = inita, b = initb, ...;condition;a = nexta, b = nextb, ...) expr ]`

[Note: Requires version 2019.05]

Generator for expressing simple recursive call in a c-style for loop.

The recursive equivalent of this generator is

```openscad
function f(a, b, ...) =
    condition
    ? concat([expr], f(nexta, nextb, ...))
    : [];
f(inita, initb, ...)
```

**Examples**

```openscad
echo( [for (a = 0, b = 1;a < 5;a = a + 1, b = b + 2) [ a, b * b ] ] );
// ECHO: [[0, 1], [1, 9], [2, 25], [3, 49], [4, 81]]

// Generate fibonacci sequence
echo([for (a = 0, b = 1;a < 1000;x = a + b, a = b, b = x) a]);
// ECHO: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987]

// Cumulative sum of values in v
function cumsum(v) = [for (a = v[0]-v[0], i = 0; i < len(v); a = a+v[i], i = i+1) a+v[i]];

echo(cumsum([1, 2, 3, 4]));
// ECHO: [1, 3, 6, 10]

echo(cumsum([[1, 1], [2, 2], [3, 3]]));
// ECHO: [[1, 1], [3, 3], [6, 6]]
```

## each

[Note: Requires version 2019.05]

`each` embeds the values of a list given as argument directly, effectively unwrapping the argument list.

`each` unwraps ranges and helps to build more general for lists when combined with multiple generator expressions.

```openscad
// Without using "each", a nested list is generated
echo([ for (a = [1 : 4]) [a, a * a] ]);
// ECHO: [[1, 1], [2, 4], [3, 9], [4, 16]]

// Adding "each" unwraps the inner list, producing a flat list as result
echo([ for (a = [1 : 4]) each [a, a * a] ]);
// ECHO: [1, 1, 2, 4, 3, 9, 4, 16]

A = [-2, each [1:2:5], each [6:-2:0], -1];
echo(A);
// ECHO: [-2, 1, 3, 5, 6, 4, 2, 0, -1]

echo([ for (a = A) 2 * a ]);
// ECHO: [-4, 2, 6, 10, 12, 8, 4, 0, -2]
```

## if

The `if` element allows selection if the expression should be allocated and added to the result list or not. In the simplest case this allows filtering of a list.

```
[ for (i = list) if (condition(i)) i ]
```

When the evaluation of the condition returns true, the expression `i` is added to the result list.

**Example**

```openscad
list = [ for (a = [ 1 : 8 ]) if (a % 2 == 0) a ];
echo(list); // ECHO: [2, 4, 6, 8]
```

Note that the `if` element cannot be inside an expression, it should be at the top.

```openscad
// from the input list include all positive odd numbers
// and also all even number divided by 2
list = [-10:5];
echo([for(n=list) if(n%2==0 || n>=0) n%2==0 ? n/2 : n ]);
// ECHO: [-5, -4, -3, -2, -1, 0, 1, 1, 3, 2, 5]

// echo([for(n=list) n%2==0 ? n/2 : if(n>=0) n ]); // this would generate a syntactical error
```

## if/else

[Note: Requires version 2019.05]

The if-else construct is equivalent to the conditional expression `?:` except that it can be combined with filter `if`.

```
[ for (i = list) if (condition(i)) x else y ]
```

When the evaluation of the condition returns true, the expression `x` is added to the result list else the expression `y`.

Note that in the expression above the conditional operator could not substitute if-else. It is possible to express this same filter with the conditional operator but with a more cryptic logic:

```openscad
// even numbers are halved, positive odd numbers are preserved, negative odd numbers are eliminated
echo([for (a = [-3:5]) if (a % 2 == 0) [a, a/2] else if (a > 0) [a, a] ]);
// ECHO: [[-2, -1], [0, 0], [1, 1], [2, 1], [3, 3], [4, 2], [5, 5]];

// even numbers are halved, positive odd numbers are preserved, negative odd numbers are eliminated
echo([for (a = [-3:5]) if (a % 2 == 0 || (a % 2 != 0 && a > 0)) a % 2 == 0 ? [a, a / 2] : [a, a] ]);
// ECHO: [[-2, -1], [0, 0], [1, 1], [2, 1], [3, 3], [4, 2], [5, 5]];
```

To bind an else expression to a specific if, it's possible to use parenthesis.

```openscad
// even numbers are dropped, multiples of 4 are substituted by -1
echo([for(i=[0:10]) if(i%2==0) (if(i%4==0) -1 ) else i]);
// ECHO: [-1, 1, 3, -1, 5, 7, -1, 9]

// odd numbers are dropped, multiples of 4 are substituted by -1
echo([for(i=[0:10]) if(i%2==0) if(i%4==0) -1 else i]);
// ECHO: [-1, 2, -1, 6, -1, 10]
```

## let

The `let` element allows sequential assignment of variables inside a list comprehension definition.

```
[ for (i = list) let (assignments) a ]
```

**Example**

```openscad
list = [ for (a = [ 1 : 4 ]) let (b = a*a, c = 2 * b) [ a, b, c ] ];
echo(list); // ECHO: [[1, 1, 2], [2, 4, 8], [3, 9, 18], [4, 16, 32]]
```

## Nested loops

There are different ways to define nested loops. Defining multiple loop variables inside one `for` element and multiple `for` elements produce both flat result lists. To generate nested result lists an additional `[ ]` markup is required.

```openscad
// nested loop using multiple variables
flat_result1 = [ for (a = [ 0 : 2 ], b = [ 0 : 2 ]) a == b ? 1 : 0 ];
echo(flat_result1); // ECHO: [1, 0, 0, 0, 1, 0, 0, 0, 1]

// nested loop using multiple for elements
flat_result2 = [ for (a = [ 0 : 2 ]) for (b = [0 : 2]) a == b ? 1 : 0 ];
echo(flat_result2); // ECHO: [1, 0, 0, 0, 1, 0, 0, 0, 1]

// nested loop to generate a bi-dimensional matrix
identity_matrix = [ for (a = [ 0 : 2 ]) [ for (b = [ 0 : 2 ]) a == b ? 1 : 0 ] ];
echo(identity_matrix); // ECHO: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
```

## Advanced Examples

### Generating vertices for a polygon

This chapter lists some advanced examples, useful idioms and use-cases for the list comprehension syntax.

Using list comprehension, a parametric equation can be calculated at a number of points to approximate many curves, such as the following example for an ellipse (using `polygon()`):

```openscad
sma = 20; // semi-minor axis
smb = 30; // semi-major axis

polygon(
    [ for (a = [0 : 5 : 359]) [ sma * sin(a), smb * cos(a) ] ]
);
```

### Flattening a nested vector

List comprehension can be used in a user-defined function to perform tasks on or for vectors. Here is a user-defined function that flattens a nested vector.

```openscad
// input : nested list
// output : list with the outer level nesting removed
function flatten(l) = [ for (a = l) for (b = a) b ] ;

nested_list = [ [ 1, 2, 3 ], [ 4, 5, 6 ] ];
echo(flatten(nested_list)); // ECHO: [1, 2, 3, 4, 5, 6]

nested_list_2 = [ 0, [ 1, 2, 3 ], [ 4, 5, 6 ] ,"abc", ["xyz"]];
echo(flatten(nested_list_2)); // ECHO: [0, 1, 2, 3, 4, 5, 6, "a", "b", "c", "xyz"]
```

### Sorting a vector

Even a complicated algorithm Quicksort becomes doable with `for()`, `if()`, `let()` and recursion:

```openscad
// input : list of numbers
// output : sorted list of numbers
function quicksort(arr) = !(len(arr)>0) ? [] : let(
    pivot   = arr[floor(len(arr)/2)],
    lesser  = [ for (y = arr) if (y  < pivot) y ],
    equal   = [ for (y = arr) if (y == pivot) y ],
    greater = [ for (y = arr) if (y  > pivot) y ]
) concat(
    quicksort(lesser), equal, quicksort(greater)
);

// use seed in rands() to get reproducible results
unsorted = [for (a = rands(0, 10, 6, 3)) ceil(a)];
echo(unsorted);            // ECHO: [6, 1, 8, 9, 3, 2]
echo(quicksort(unsorted)); // ECHO: [1, 2, 3, 6, 8, 9]
```

### Selecting elements of a vector

`select()` performs selection and reordering of elements into a new vector.

Using indices:

```openscad
function select(vector, indices) = [ for (index = indices) vector[index] ];

vector1 = [[0,0],[1,1],[2,2],[3,3],[4,4]];
selector1 = [4,0,3];

vector2 = select(vector1,selector1);          // [[4, 4], [0, 0], [3, 3]]
vector3 = select(vector1,[0,2,4,4,2,0]);      // [[0, 0], [2, 2], [4, 4],[4, 4], [2, 2], [0, 0]]

// range also works as indices
vector4 = select(vector1, [4:-1:0]);          // [[4, 4], [3, 3], [2, 2], [1, 1], [0, 0]]
```

### Concatenating two vectors

Without using indices:

```openscad
function cat(L1, L2) = [for (i=[0:len(L1)+len(L2)-1])
                         i < len(L1)? L1[i] : L2[i-len(L1)]] ;
echo(cat([1,2,3],[4,5])); //concatenates two OpenSCAD lists [1,2,3] and [4,5], giving [1, 2, 3, 4, 5]
```

```openscad
function cat(L1, L2) = [for(L=[L1, L2], a=L) a];
echo(cat([1,2,3],[4,5])); //concatenates two OpenSCAD lists [1,2,3] and [4,5], giving [1, 2, 3, 4, 5]
```

---

# OpenSCAD User Manual/User-Defined Functions and Modules

Users can extend the language by defining their own functions and modules. This allows grouping portions of script for easy reuse with different values. Well chosen names also help document your script.

- **Functions** return values.
- **Modules** perform actions, but do not return values.

OpenSCAD calculates the value of variables at compile-time, not run-time. The last variable assignment within a scope applies everywhere in that scope. It also applies to any inner scopes, or children, thereof. See Scope of variables for more details. It may be helpful to think of them as override-able constants rather than as variables.

For functions and modules, OpenSCAD makes copies of pertinent portions of the script for each use. Each copy has its own scope, which contains fixed values for variables and expressions unique to that instance.

The name of functions and modules is case sensitive, therefore `test()` and `TEST()` refer to different functions/modules.

Modules and functions can be defined within a module definition, where they are visible only in the scope of that module.

## Scope

For example

```openscad
function parabola(f,x) = ( 1/(4*f) ) * x*x;

module plotParabola(f,wide,steps=1) {
    function y(x) = parabola(f,x);
    module plot(x,y) {
        translate([x,y])
        circle(1,$fn=12);
    }
    xAxis=[-wide/2:steps:wide/2];
    for (x=xAxis)
        plot(x, y(x));
}

color("red") plotParabola(10, 100, 5);
color("blue") plotParabola(4, 60, 2);
```

The function `y()` and module `plot()` cannot be called in the global scope.

## Functions

Functions operate on values to calculate and return new values.

**function definition**

```
function name ( parameters ) = value ;
```

- **name** — Your name for this function. A meaningful name is helpful later. Currently valid names can only be composed of simple characters and underscores `[a-zA-Z0-9_]` and do not allow high-ascii or unicode characters.
- **parameters** — Zero or more arguments. Parameters can be assigned default values, to use in case they are omitted in the call. Parameter names are local and do not conflict with external variables of the same name.
- **value** — an expression that calculates a value. This value can be a vector.

When used, functions are treated as values, and do not themselves end with a semicolon `;`.

### Function use

```openscad
// example 1
function func0() = 5;
function func1(x=3) = 2*x+1;
function func2() = [1,2,3,4];
function func3(y=7) = (y==7) ? 5 : 2 ;
function func4(p0,p1,p2,p3) = [p0,p1,p2,p3];

echo(func0());                                // 5
a = func1();                                  // 7
b = func1(5);                                 // 11
echo(func2());                                // [1, 2, 3, 4]
echo(func3(2), func3());                      // 2, 5
z = func4(func0(), func1(), func2(), func3());
                                              // [5, 7, [1, 2, 3, 4], 5]

translate([0, -4*func0(), 0])
cube([func0(), 2*func0(), func0()]);
// same as translate([0,-20,0]) cube([5,10,5]);
```

```openscad
// example 2 creates for() range to give desired no of steps to cover range
function steps(start, no_steps, end) =
    [start : (end-start)/(no_steps-1) : end];

echo(steps(10, 3, 5));                        // [10 : -2.5 : 5]
for (i = steps(10, 3, 5)) echo(i);            // 10 7.5 5
echo(steps(10, 3, 15));                       // [10 : 2.5 : 15]
for (i = steps(10, 3, 15)) echo(i);           // 10 12.5 15
echo(steps(0, 5, 5));                         // [0 : 1.25 : 5]
for (i = steps(0, 5, 5)) echo(i);             // 0 1.25 2.5 3.75 5
```

**Example 3**

```openscad
// example 3     rectangle with top pushed over, keeping same y
function rhomboid(x=1, y=1, angle=90)
    = [[0,0],[x,0],
       [x+x*cos(angle)/sin(angle),y],
       [x*cos(angle)/sin(angle),y]];

echo (v1); v1 = rhomboid(10,10,35);           // [[0, 0],
                                               //  [10, 0],
                                               //  [24.2815, 10],
                                               //  [14.2815, 10]]
polygon(v1);
polygon(rhomboid(10,10,35));                   // alternate

//performing the same action with a module
module parallelogram(x=1,y=1,angle=90)
    {polygon([[0,0],[x,0],
              [x+x*cos(angle)/sin(angle),y],
              [x*cos(angle)/sin(angle),y]]);};
parallelogram(10,10,35);
```

You can also use the `let` statement to create variables in a function:

```openscad
function get_square_triangle_perimeter(p1, p2) =
    let (hypotenuse = sqrt(p1*p1+p2*p2))
    p1 + p2 + hypotenuse;
```

It can be used to store values in recursive functions. See the wikipedia page for more information on the general concept.

### Recursive functions

Recursive function calls are supported. Using the Conditional Operator "... ? ... : ... ", it is possible to ensure the recursion is terminated.

There is a built-in recursion limit to prevent an application crash (a few thousands). If the limit is hit, you get an error like: `ERROR: Recursion detected calling function ...` .

```openscad
// recursion example: add all integers up to n
function add_up_to(n) = ( n==0 ?
    0 :
    n + add_up_to(n-1) );
```

For any tail-recursive function that calls itself, OpenSCAD is able to eliminate internally the recursion transforming it in an iterative loop.

The previous example code is not tail recursion, as the binary `+` can only execute when both its operand values are available. Its execution will therefore occur after the recursive call `add_up_to(n-1)` has generated its second operand value.

However, the following is entitled to tail-recursion elimination:

```openscad
// tail-recursion elimination example: add all integers up to n
function add_up_to(n, sum=0) =
    n==0 ?
    sum :
    add_up_to(n-1, sum+n);

echo(sum=add_up_to(100000));
// ECHO: sum = 5.00005e+009
```

Tail-recursion elimination allows much higher recursion limits (up to 1000000).

### Function Literals

[Note: Requires version 2021.01]

Function literals are expressions that define functions, other names for this are lambdas or closures.

**function literal**

```
function (x) x + x
```

Function literals can be assigned to variables and passed around like any value. Calling the function uses the normal function call syntax with parenthesis.

```openscad
func = function (x) x * x;
echo(func(5)); // ECHO: 25
```

It's possible to define functions that return functions. Unbound variables are captured by lexical scope.

```openscad
a = 1;
selector = function (which)
    which == "add"
    ? function (x) x + x + a
    : function (x) x * x + a;

echo(selector("add"));       // ECHO: function(x) ((x + x) + a)
echo(selector("add")(5));    // ECHO: 11

echo(selector("mul"));       // ECHO: function(x) ((x * x) + a)
echo(selector("mul")(5));    // ECHO: 26
```

### Overwriting built-in functions

It is possible to overwrite the built-in functions. Note that definitions are handled first, so the evaluation does indeed return true for both `echo()` calls as those are evaluated in a later processing step.

| Source Code | Console output |
| --- | --- |
| `echo (sin(1));`<br>`function sin(x) = true;`<br>`echo (sin(1));` | `Compiling design (CSG Tree generation)...`<br>`ECHO: true`<br>`ECHO: true`<br>`Compiling design (CSG Products generation)...` |

## Modules

Modules can be used to define objects or, using `children()`, define operators. Once defined, modules are temporarily added to the language.

**module definition**

```
module name ( parameters ) { actions }
```

- **name** — Your name for this module. Try to pick something meaningful. Currently, valid names can only be composed of simple characters and underscores `[a-zA-Z0-9_]` and do not allow high-ASCII or Unicode characters.
- **parameters** — Zero or more arguments. Parameters may be assigned default values, to use in case they are omitted in the call. Parameter names are local and do not conflict with external variables of the same name.
- **actions** — Nearly any statement valid outside a module can be included within a module. This includes the definition of functions and other modules. Such functions and modules can be called only from within the enclosing module.

Variables can be assigned, but their scope is limited to within each individual use of the module. There is no mechanism in OpenSCAD for modules to return values to the outside. See Scope of variables for more details.

### Object modules

Object modules use one or more primitives, with associated operators, to define new objects.

In use, object modules are actions ending with a semi-colon `;`.

```
name ( parameter values );
```

```openscad
//example 1
translate([-30,-20,0])
ShowColorBars(Expense);

ColorBreak=[[0,""],
    [20,"lime"],            // upper limit of color range
    [40,"greenyellow"],
    [60,"yellow"],
    [75,"LightCoral"],
    [200,"red"]];

Expense=[16,20,25,85,52,63,45];

module ColorBar(value,period,range){          // 1 color on 1 bar
    RangeHi = ColorBreak[range][0];
    RangeLo = ColorBreak[range-1][0];
    color( ColorBreak[range][1] )
    translate([10*period,0,RangeLo])
    if (value > RangeHi)     cube([5,2,RangeHi-RangeLo]);
    else if (value > RangeLo) cube([5,2,value-RangeLo]);
}

module ShowColorBars(values){
    for (month = [0:len(values)-1], range = [1:len(ColorBreak)-1])
    ColorBar(values[month],month,range);
}
```

```openscad
//example 2
module house(roof="flat",paint=[1,0,0]) {
    color(paint)
    if(roof=="flat") { translate([0,-1,0]) cube(); }
    else if(roof=="pitched") {
        rotate([90,0,0]) linear_extrude(height=1)
        polygon(points=[[0,0],[0,1],[0.5,1.5],[1,1],[1,0]]); }
    else if(roof=="domical") {
        translate([0,-1,0]){
        translate([0.5,0.5,1]) sphere(r=0.5,$fn=20); cube(); }
    } }

house();
translate([2,0,0]) house("pitched");
translate([4,0,0]) house("domical",[0,1,0]);
translate([6,0,0]) house(roof="pitched",paint=[0,0,1]);
translate([0,3,0]) house(paint=[0,0,0],roof="pitched");
translate([2,3,0]) house(roof="domical");
translate([4,3,0]) house(paint=[0,0.5,0.5]);
```

```openscad
//example 3
element_data = [[0,"","",0],                  // must be in order
    [1,"Hydrogen","H",1.008],                 // indexed via atomic number
    [2,"Helium", "He",4.003]                  // redundant atomic number to preserve your sanity later
    ];

Hydrogen = 1;
Helium   = 2;

module coaster(atomic_number){
    element     = element_data[atomic_number][1];
    symbol      = element_data[atomic_number][2];
    atomic_mass = element_data[atomic_number][3];
    //rest of script
}
```

### Operator modules

Use of `children()` allows modules to act as operators applied to any or all of the objects within this module instantiation. In use, operator modules do not end with a semi-colon.

```
name ( parameter values ){scope of operator}
```

### Children

Basically the `children()` command is used to apply modifications to objects that are focused by a scope:

```openscad
module myModification() { rotate([0,45,0]) children(); }

myModification()         // The modification
{                        // Begin focus
    cylinder(10,4,4);    // First child
    cube([20,2,2], true);// Second child
}                        // End focus
```

Objects are indexed via integers from 0 to `$children-1`. OpenSCAD sets `$children` to the total number of objects within the scope. Objects grouped into a sub scope are treated as one child. See example of separate children below and Scope of variables. Note that `children()`, `echo()` and empty block statements (including ifs) count as `$children` objects, even if no geometry is present (as of v2017.12.23).

```
children();                           all children
children(index);                      value or variable to select one child
children([start : step : end]);       select from start to end incremented by step
children([start : end]);              step defaults to 1 or -1
children([vector]);                   selection of several children
```

**Deprecated child() module**

Up to release 2013.06 the now deprecated `child()` module was used instead. This can be translated to the new `children()` according to the table:

| up to 2013.06 | 2014.03 and later |
| --- | --- |
| `child()` | `children(0)` |
| `child(x)` | `children(x)` |
| `for (a = [0:$children-1]) child(a)` | `children([0:$children-1])` |

### Examples

**Use all children**

```openscad
//Use all children
module move(x=0,y=0,z=0,rx=0,ry=0,rz=0)
{ translate([x,y,z])rotate([rx,ry,rz]) children(); }

move(10)           cube(10,true);
move(-10)          cube(10,true);
move(z=7.07, ry=45)cube(10,true);
move(z=-7.07,ry=45)cube(10,true);
```

**Use only the first child, multiple times**

```openscad
//Use only the first child, multiple times
module lineup(num, space) {
    for (i = [0 : num-1])
        translate([ space*i, 0, 0 ]) children(0);
}

lineup(5, 65){ sphere(30);cube(35);}
```

**Separate action for each child**

```openscad
//Separate action for each child
module SeparateChildren(space){
    for ( i= [0:1:$children-1])   // step needed in case $children < 2
        translate([i*space,0,0]) {children(i);text(str(i));}
}

SeparateChildren(-20){
    cube(5);               // 0
    sphere(5);             // 1
    translate([0,20,0]){   // 2
        cube(5);
        sphere(5);
    }
    cylinder(15);          // 3
    cube(8,true);          // 4
}

translate([0,40,0])color("lightblue")
SeparateChildren(20){cube(3,true);}
```

**Multiple ranges**

```openscad
//Multiple ranges
module MultiRange(){
    color("lightblue") children([0:1]);
    color("lightgreen")children([2:$children-2]);
    color("lightpink") children($children-1);
}

MultiRange()
{
    cube(5);               // 0
    sphere(5);             // 1
    translate([0,20,0]){   // 2
        cube(5);
        sphere(5);
    }
    cylinder(15);          // 3
    cube(8,true);          // 4
}
```

### Further module examples

**Objects**

```openscad
module arrow(){
    cylinder(10);
    cube([4,.5,3],true);
    cube([.5,4,3],true);
    translate([0,0,10]) cylinder(4,2,0,true);
}

module cannon(){
    difference(){union()
    {sphere(10);cylinder(40,10,8);} cylinder(41,4,4);
    } }

module base(){
    difference(){
    cube([40,30,20],true);
    translate([0,0,5]) cube([50,20,15],true);
    } }
```

**Operators**

```openscad
module aim(elevation,azimuth=0)
{   rotate([0,0,azimuth])
    {   rotate([0,90-elevation,0]) children(0);
        children([1:1:$children-1]); // step needed in case $children < 2
    } }

aim(30,20)arrow();
aim(35,270)cannon();
aim(15){cannon();base();}
```

**Rotary Clusters**

```openscad
module RotaryCluster(radius=30,number=8)
    for (azimuth =[0:360/number:359])
        rotate([0,0,azimuth])
        translate([radius,0,0]) { children();
            translate([40,0,30]) text(str(azimuth)); }

RotaryCluster(200,7) color("lightgreen") aim(15){cannon();base();}
rotate([0,0,110]) RotaryCluster(100,4.5) aim(35)cannon();
color("LightBlue")aim(55,30){cannon();base();}
```

### Recursive modules

Like functions, modules may contain recursive calls. However, there is no tail-recursion elimination for recursive modules.

The code below generates a crude model of a tree. Each tree branch is itself a modified version of the tree and produced by recursion. Be careful to keep the recursion depth (branching) `n` below 7 as the number of primitives and the preview time grow exponentially.

```openscad
module simple_tree(size, dna, n) {
    if (n > 0) {
        // trunk
        cylinder(r1=size/10, r2=size/12, h=size, $fn=24);
        // branches
        translate([0,0,size])
        for(bd = dna) {
            angx = bd[0];
            angz = bd[1];
            scal = bd[2];
            rotate([angx,0,angz])
            simple_tree(scal*size, dna, n-1);
        }
    }
    else { // leaves
        color("green")
        scale([1,1,3])
        translate([0,0,size/6])
        rotate([90,0,0])
        cylinder(r=size/6,h=size/10);
    }
}

// dna is a list of branching data bd of the tree:
//     bd[0] - inclination of the branch
//     bd[1] - Z rotation angle of the branch
//     bd[2] - relative scale of the branch
dna = [ [12, 80, 0.85], [55, 0, 0.6],
        [62, 125, 0.6], [57, -125, 0.6] ];
simple_tree(50, dna, 5);
```

Another example of recursive module may be found in Tips and Tricks.

### Overwriting built-in modules

It is possible to overwrite the built-in modules.

A simple, but pointless example would be:

```openscad
module sphere(){
    square();
}
sphere();
```

Note that the built-in `sphere` module can not be called when over written.

A more sensible way to use this language feature is to overwrite the 3D primitives with extruded 2D-primitives. This allows additional customization of the default parameters and adding additional parameters.


---

# OpenSCAD User Manual/Other Language Features

## Special variables

Special variables provide an alternate means of passing arguments to modules and functions. All user, or OpenSCAD, defined variables starting with a '$' are special variables, similar to special variables in lisp. Modules and function see all outside variables in addition to those passed as arguments or defined internally.

Currently valid special variable names can only be composed of `$` followed by simple characters and underscores `[a-zA-Z0-9_]` and do not allow high-ascii or unicode characters.

The value for a regular variable is assigned at compile time and is thus static for all calls.

Special variables pass along their value from within the scope (see scope of variables) from which the module or function is called. This means that special variables can potentially have a different value each time a module or function is called.

```openscad
regular = "regular global";
$special = "special global";

module show() echo("  in show ", regular," ", $special );

echo ("  outside ", regular," ", $special );
// ECHO: "  outside ", "regular global", " ", "special global"

for ( regular = [0:1] ){ echo("in regular loop  ", regular," ", $special ); show();}
// ECHO: "in regular loop  ", 0, " ", "special global"
// ECHO: "  in show ", "regular global", " ", "special global"
// ECHO: "in regular loop  ", 1, " ", "special global"
// ECHO: "  in show ", "regular global", " ", "special global"

for ( $special = [5:6] ){ echo("in special loop  ", regular," ", $special ); show();}
// ECHO: "in special loop  ", "regular global", " ", 5
// ECHO: "  in show ", "regular global", " ", 5
// ECHO: "in special loop  ", "regular global", " ", 6
// ECHO: "  in show ", "regular global", " ", 6

show();
// ECHO: "  in show ", "regular global", " ", "special global"
```

This is useful when multiple arguments need to be passed thru several layers of module calls.

Several special variables are already defined by OpenSCAD.

## Circle resolution: $fa, $fs, and $fn

The `$fa`, `$fs`, and `$fn` special variables control the number of segments used to generate an arc:

- **$fa** is the minimum angle for a line segment. Even a huge circle does not have more line segments than 360 divided by this number. The default value is 12 (i.e. 30 line segments for a full circle). The minimum allowed value is 0.01. Attempting to set a lower value causes a warning.

- **$fs** is the minimum size of a line segment. The default value is 2 so very small circles have a smaller number of line segments than specified using `$fa`. The minimum allowed value is 0.01. Attempting to set a lower value causes a warning.

- **$fn** is number of line segments and usually has the default value of 0. When this variable has a value greater than zero, the other two variables are ignored, and a full circle is rendered using this number of line segments.

The higher the number of line segments, the more memory and CPU consumed; large values can bring many systems to their knees. Depending on the design, `$fn` values, and the corresponding results of `$fa` & `$fs`, should be kept small, at least until the design is finalised when it can be increased for the final result. A `$fn` over 128 is not recommended or only for specific circumstances, and below 50 would be advisable for performance.

You can also use two different values for preview and render:

```openscad
$fn = $preview ? 32 : 64;
```

> **TIP:** If you want to create a circle/cylinder/sphere which has an axis aligned integer bounding box (i.e. a bounding box that has integral dimensions, and an integral position) use a value of `$fn` that is divisible by 4. The circular shape appears as a faceted polygon that is inscribed within the radius or diameter provided.

When `$fa` and `$fs` are used to determine the number of line segments for a circle, then OpenSCAD never uses fewer than 5 line segments.

This is the C code that calculates the number of line segments in a circle:

```c
int get_line segments_from_r(double r, double fn, double fs, double fa)
{
    if (r < GRID_FINE) return 3;
    if (fn > 0.0) return (int)(fn >= 3 ? fn : 3);
    return (int)ceil(fmax(fmin(360.0 / fa, r*2*M_PI / fs), 5));
}
```

Or you can embed this OpenSCAD version in your code to work out what's going on, you need to set `r=` to your size:

```openscad
echo(n=($fn>0?($fn>=3?$fn:3):ceil(max(min(360/$fa,r*2*PI/$fs),5))),a_based=floor(360/$fa),s_based=floor(r*2*PI/$fs));
```

Spheres are first sliced into as many slices as the number of line segments being used to render a circle of the sphere's radius, and then every slice is rendered into as many line segments as are needed for the slice radius. You might have recognized already that the pole of a sphere is usually a pentagon, because 5 is the minimum value for line segments when calculated from `$fa` and `$fs`.

The number of line segments for a cylinder is determined using the greater of the two radii.

The method is also used when rendering circles and arcs from DXF files. The variables have no effect when importing STL files.

You can generate high resolution spheres by resetting the `$fX` values in the instantiating module:

```openscad
$fs = 0.01;
sphere(2);
```

or simply by passing the special variable as parameter:

```openscad
sphere(2, $fs = 0.01);
```

You can even scale the special variable instead of resetting it:

```openscad
sphere(2, $fs = $fs * 0.01);
```

## Animation: $t

The `$t` variable is used in "rotate" and "translate" for animation, `$t*360` giving complete cycles. To start animation, select View/animate and enter values for "FPS" and "Steps". The "Time" field shows the current value of `$t` as a decimal fraction.

The value of `$t` will repeat from 0 through (1 - 1/Steps). It never reaches 1 because this would produce a "hitch" in the animation if using it for rotation -- two consecutive frames would be at the same angle.

There is no variable to distinguish between the cases of animation running at the first frame ($t=0) and animation not running, so make $t=0 your rest position for the model.

### Simple harmonic motion

```openscad
translate ([0, 0, 10*sin($t*360)])
    sphere(2);
```

Simple harmonic motion, 20 FPS, 100 steps gives a sphere that oscillates between -10 and +10 on the Z-axis.

### Rotation

```openscad
rotate ([0, 0, $t*360])
    square(5);
```

rotates a square around one corner around the Z-axis. To rotate the square about its middle, use:

```openscad
rotate ([0, 0, $t*360])
    square(5, center=true);
```

### Part-rotation

All parts in an animation complete one cycle of motion in the same time, `$t`, jump back to zero, and start again. However, the cycles can be given different numbers of steps, to give the illusion of different speeds in the same animation. This can be used to animate meshing gears of different sizes.

```openscad
rotate([0, 0, $t*360/17])
    gear(teeth=17);
```

and

```openscad
rotate([0, 0, -$t*360/31])
    gear(teeth=31);
```

### Circular orbit

```openscad
rotate ([0, 0, $t*360])
    translate ([10, 0])
        square(5, center=true);
```

### Circular orbit without rotation

```openscad
rotate ([0, 0, $t*360])
    translate ([9, 0])
        rotate ([0, 0, -$t*360])
            square(5, center=true);
```

### Elliptical orbit

```openscad
translate([10*sin($t*360), 20*cos($t*360)])
    square(2, center=true);
```

Note that with "translate", the object does not rotate.

### Elliptical motion

```openscad
e=10;
rotate([0, 0, $t*360])
    translate([e, 0])
        rotate([0, 0, -$t*720])
            square([2*e, 2], center=true);
```

### Animated gears 17T and 31T

If "Dump Pictures" is checked, then images are created in the same directory as the .scad file. The exported PNG files can be turned into a gif via command line:

```bash
magick -delay 10 -loop 0 *.png myimage.gif
```

where `-delay 10` is the duration of each frame in milliseconds, and `-loop 0` specifies the number of loops (0 = loop forever).

The `magick` command is part of ImageMagick, which can be installed on Linux, macOS, and Windows. Additional parameters are possible for cropping and scaling.

## Viewport: $vpr, $vpt, $vpf and $vpd

These contain the current viewport rotation and translation and camera distance - at the time of doing the rendering. Moving the viewport does not update them. During an animation they are updated for each frame.

- `$vpr` shows rotation
- `$vpt` shows translation (i.e. won't be affected by rotate and zoom)
- `$vpf` shows the FOV (Field of View) of the view [Note: Requires version 2021.01]
- `$vpd` shows the camera distance [Note: Requires version 2015.03]

**Example**

```openscad
cube([10, 10, $vpr[0] / 10]);
```

which makes the cube change size based on the view angle, if an animation loop is active (which does not need to use the `$t` variable)

You can also make bits of a complex model vanish as you change the view.

All four variables are writable, but only assignments at the top-level of the main file has an effect on the viewport. [Note: Requires version 2015.03]

**Example**

```openscad
$vpr = [0, 0, $t * 360];
```

which allows a simple 360 degree rotation around the Z axis in animation mode.

The menu command Edit - Paste Viewport Rotation/Translation copies the current value of the viewport, but not the current `$vpr` or `$vpt`.

## Execution mode: $preview

[Note: Requires version 2019.05]

`$preview` is true, when in OpenCSG preview (F5). `$preview` is false, when in render (F6).

This can, for example, be used to reduce detail during preview to save time, without losing detail in the final rendered result:

```openscad
$fn = $preview ? 12 : 72;
sphere(r = 1);
```

Note that the `render` module does not affect `$preview`:

```openscad
render(){
    $fn = $preview ? 12 : 72;
    sphere(r = 1);
}
```

Another use could be to make the preview show an assembly view and the render generate just the printed parts laid out for printing.

If printed parts need extra features that are removed post printing, for example support for suspended holes, then the preview can omit these to show the finished part after post processing.

When OpenSCAD is run from the command line `$preview` is only true when generating a PNG image with OpenCSG. It is false when generating STL, DXF and SVG files with CGAL. It is also false when generating CSG and ECHO files. This may or may not be what you want, but you can always override it on the command line like any other variable with the `-D` option.

## Echo module

The `echo()` module prints the contents to the compilation window (aka Console). Useful for debugging code. Also see the String function `str()`.

Numeric values are rounded to 5 significant digits.

It can be handy to use 'variable=variable' as the expression to easily label the variables, see the example below.

**Usage examples:**

```openscad
my_h=50;
my_r=100;
echo("This is a cylinder with h=", my_h, " and r=", my_r);
echo(my_h=my_h,my_r=my_r); // shortcut
cylinder(h=my_h, r=my_r);
```

Shows in the Console as:

```
ECHO: "This is a cylinder with h=", 50, " and r=", 100
ECHO: my_h = 50, my_r = 100
```

Note that the output will not have the extra double quotes and commas if converted to a string using `str()`.

### Rounding examples

An example for the rounding:

```openscad
a=1.0;
b=1.000002;
echo(a);
echo(b);
if(a==b){ //while echoed the same, the values are still distinct
    echo ("a==b");
}else if(a>b){
    echo ("a>b");
}else if(a<b){
    echo ("a<b");
}else{
    echo ("???");
}
```

Shows in the Console as:

```
ECHO: 1
ECHO: 1
ECHO: "a<b"
```

### Small and large Numbers

```openscad
c=1000002;
d=0.000002;
echo(c); //1e+06
echo(d); //2e-06
```

### HTML

HTML output is not officially supported, however depending on the OpenSCAD version, some HTML tags were rendered in the console window.

## Echo function

[Note: Requires version 2019.05]

Echo can be used in expression context to print information while the function/expression is evaluated. The output is generated before the expression evaluation to allow debugging of recursive functions.

**Example**

```openscad
a = 3; b = 5;

// echo() prints values before evaluating the expression
r1 = echo(a, b) a * b; // ECHO: 3, 5

// using let it's still easy to output the result
r2 = let(r = 2 * a * b) echo(r) r; // ECHO: 30

// use echo statement for showing results
echo(r1, r2); // ECHO: 15, 30
```

A more complex example shows how `echo()` can be used in both descending and ascending path of a recursive function. The `result()` helper function is a simple way to output the value of an expression after evaluation.

**Example printing both input values and result of recursive sum()**

```openscad
v = [4, 7, 9, 12];
function result(x) = echo(result = x) x;
function sum(x, i = 0) = echo(str("x[", i, "]=", x[i])) result(len(x) > i ? x[i] + sum(x, i + 1) : 0);

echo("sum(v) = ", sum(v));
// ECHO: "x[0]=4"
// ECHO: "x[1]=7"
// ECHO: "x[2]=9"
// ECHO: "x[3]=12"
// ECHO: "x[4]=undef"
// ECHO: result = 0
// ECHO: result = 12
// ECHO: result = 21
// ECHO: result = 28
// ECHO: result = 32
// ECHO: "sum(v) = ", 32
```

## render

Forces the generation of a mesh even in preview mode. This is useful in certain situations, e.g. when the boolean operations become too slow to track.

Render can also be used (typically in conjunction with convexity) to avoid/workaround preview artifacts. See also OpenSCAD User Manual/FAQ#Why are some parts (e.g. holes) of the model not rendered correctly?

**Usage examples:**

```openscad
render(convexity = 2) difference() {
    cube([20, 20, 150], center = true);
    translate([-10, -10, 0])
        cylinder(h = 80, r = 10, center = true);
    translate([-10, -10, +40])
        sphere(r = 10);
    translate([-10, -10, -40])
        sphere(r = 10);
}
```

## surface

Surface reads Heightmap information from text or image files.

**Parameters**

- **file** — String. The path to the file containing the heightmap data.

- **center** — Boolean. This determines the positioning of the generated object. If true, object is centered in X- and Y-axis. Otherwise, the object is placed in the positive quadrant. Defaults to false.

- **invert** — Boolean. Inverts how the color values of imported images are translated into height values. This has no effect when importing text data files. Defaults to false. The geometry that results from using this parameter is positioned with its top in the z = 0 plane. A thin "footprint" layer, one unit thick, is added automatically just below the height map. [Note: Requires version 2015.03]

- **convexity** — Integer. The convexity parameter specifies the maximum number of front sides (back sides) a ray intersecting the object might penetrate. This parameter is only needed for correctly displaying the object in OpenCSG preview mode and has no effect on the final rendering.

### Text file format

The format for text based height maps is a matrix of numbers which represent the heights for specific points. Rows are mapped in Y-axis direction, columns in X axis direction, with one unit increment between adjacent rows and columns. The numbers must be separated by spaces or tabs. Empty lines and lines starting with a `#` character are ignored.

### Images

[Note: Requires version 2015.03]

Currently only PNG images are supported. Alpha channel information of the image is ignored and the height for the pixel is determined by converting the color value to Grayscale using the linear luminance for the sRGB color space (Y = 0.2126R + 0.7152G + 0.0722B). The gray scale values are scaled to be in the range 0 to 100.

A thin "footprint" layer, one unit thick, is added automatically just below the height map.

### Examples

**Example 1:**

```openscad
//surface.scad
surface(file = "surface.dat", center = true, convexity = 5);
%translate([0,0,5])cube([10,10,10], center = true);
```

```
#surface.dat
10 9 8 7 6 5 5 5 5 5
9 8 7 6 6 4 3 2 1 0
8 7 6 6 4 3 2 1 0 0
7 6 6 4 3 2 1 0 0 0
6 6 4 3 2 1 1 0 0 0
6 6 3 2 1 1 1 0 0 0
6 6 2 1 1 1 1 0 0 0
6 6 1 0 0 0 0 0 0 0
3 1 0 0 0 0 0 0 0 0
3 0 0 0 0 0 0 0 0 0
```

**Example 2:**

```matlab
// example010.dat generated using octave or matlab:
d = (sin(1:0.2:10)' * cos(1:0.2:10)) * 10;
save("-ascii", "example010.dat", "d");
```

```openscad
//original surface
surface(file = "example010.dat", center = true, convexity = 5);

//rotated surface
translate(v = [70, 0, 0]) rotate(45, [0, 0, 1]) surface(file = "example010.dat", center = true, convexity = 5);

//intersection
translate(v = [35, 60, 0])
    intersection() {
        surface(file = "example010.dat", center = true, convexity = 5);
        rotate(45, [0, 0, 1]) surface(file = "example010.dat", center = true, convexity = 5);
    }
```

**Example 3:**

[Note: Requires version 2015.03]

```openscad
// Example 3a
scale([1, 1, 0.1])
    surface(file = "smiley.png", center = true);
```

```openscad
// Example 3b
scale([1, 1, 0.1])
    surface(file = "smiley.png", center = true, invert = true);
```

| Input image | Example 3a: surface(invert = false) | Example 3b: surface (invert = true) |
|---|---|---|

Example 3: Using surface() with a PNG image as heightmap input.

**Example 4:**

[Note: Requires version 2015.03]

```openscad
// Example 4
surface(file = "BRGY-Grey.png", center = true, invert = false);
```

| PNG Test File | 3D Surface |
|---|---|

## search

The `search()` function is a general-purpose function to find one or more (or all) occurrences of a value or list of values in a vector, string or more complex list-of-list construct.

### Search usage

```openscad
search( match_value , string_or_vector [, num_returns_per_match [, index_col_num ] ] );
```

### Search arguments

**match_value**

- Can be a single string value. Search loops over the characters in the string and searches for each one in the second argument. The second argument must be a string or a list of lists (this second case is not recommended). The search function does not search for substrings.
- Can be a single numerical value.
- Can be a list of values. The search function searches for each item on the list.
- To search for a list or a full string give the list or string as a single element list such as `["abc"]` to search for the string "abc" (See Example 9) or `[[6,7,8]]` to search for the list `[6,7,8]`. Without the extra brackets, search looks separately for each item in the list.
- If match_value is boolean then search returns undef.

**string_or_vector**

- The string or vector to search for matches.
- If match_value is a string then this should be a string and the string is searched for individual character matches to the characters in match_value.
- If this is a list of lists, `v=[[a0,a1,a2...],[b0,b1,b2,...],[c0,c1,c2,...],...]` then search looks only at one index position of the sublists. By default this is position 0, so the search looks only at a0, b0, c0, etc. The `index_col_num` parameter changes which index is searched.
- If match_value is a string and this parameter is a list of lists then the characters of the string are tested against the appropriate index entry in the list of lists. However, if any characters fail to find a match a warning message is printed and that return value is excluded from the output (if num_returns_per_match is 1). This means that the length of the output is unpredictable.

**num_returns_per_match** (default: 1)

- By default, search only looks for one match per element of match_value to return as a list of indices.
- If num_returns_per_match > 1, search returns a list of lists of up to num_returns_per_match index values for each element of match_value.
  - See Example 8 below.
- If num_returns_per_match = 0, search returns a list of lists of all matching index values for each element of match_value.
  - See Example 6 below.

**index_col_num** (default: 0)

- As noted above, when searching a list of lists, search looks only at one index position of each sublist. That index position is specified by index_col_num.
- See Example 5 below for a simple usage example.

### Search usage examples

See example023.scad included with OpenSCAD for a renderable example.

| Example | Code | Result |
|---|---|---|
| 1 | `search("a","abcdabcd");` | `[0]` |
| 2 | `search("e","abcdabcd");` | `[]` |
| 3 | `search("a","abcdabcd",0);` | `[[0,4]]` |
| 4 | `data=[ ["a",1],["b",2],["c",3],["d",4],["a",5],["b",6],["c",7],["d",8],["e",9] ];`<br>`search("a", data, num_returns_per_match=0);` | `[[0,4]]` (see also Example 6 below) |

#### Index values return as list

**Example 5:**

```openscad
data= [ ["a",1],["b",2],["c",3],["d",4],["a",5],["b",6],["c",7],["d",8],["e",3] ];
echo(search(3, data));           // Searches index 0, so it doesn't find anything
echo(search(3, data, num_returns_per_match=0, index_col_num=1));
```

Outputs:

```
ECHO: []
ECHO: [2, 8]
```

#### Search on different column; return Index values

#### Search on list of values

**Example 6:** Return all matches per search vector element.

```openscad
data= [ ["a",1],["b",2],["c",3],["d",4],["a",5],["b",6],["c",7],["d",8],["e",9] ];
search("abc", data, num_returns_per_match=0);
```

Returns:

```
[[0,4],[1,5],[2,6]]
```

**Example 7:** Return first match per search vector element; special case return vector.

```openscad
data= [ ["a",1],["b",2],["c",3],["d",4],["a",5],["b",6],["c",7],["d",8],["e",9] ];
search("abc", data, num_returns_per_match=1);
```

Returns:

```
[0,1,2]
```

**Example 8:** Return first two matches per search vector element; vector of vectors.

```openscad
data= [ ["a",1],["b",2],["c",3],["d",4],["a",5],["b",6],["c",7],["d",8],["e",9] ];
search("abce", data, num_returns_per_match=2);
```

Returns:

```
[[0,4],[1,5],[2,6],[8]]
```

#### Search on list of strings

**Example 9:**

```openscad
lTable2=[ ["cat",1],["b",2],["c",3],["dog",4],["a",5],["b",6],["c",7],["d",8],["e",9],["apple",10],["a",11] ];
lSearch2=["b","zzz","a","c","apple","dog"];
l2=search(lSearch2,lTable2);
echo(str("Default list string search (",lSearch2,"): ",l2));
```

Returns:

```
ECHO: "Default list string search (["b", "zzz", "a", "c", "apple", "dog"]): [1, [], 4, 2, 9, 3]"
```

#### Getting the right results

```openscad
// workout which vectors get the results
v=[ ["O",2],["p",3],["e",9],["n",4],["S",5],["C",6],["A",7],["D",8] ];
//
echo(v[0]);                          // -> ["O",2]
echo(v[1]);                          // -> ["p",3]
echo(v[1][0],v[1][1]);              // -> "p",3
echo(search("p",v));                 // find "p" -> [1]
echo(search("p",v)[0]);             // -> 1
echo(search(9,v,0,1));              // find 9 -> [2]
echo(v[search(9,v,0,1)[0]]);        // -> ["e",9]
echo(v[search(9,v,0,1)[0]][0]);     // -> "e"
echo(v[search(9,v,0,1)[0]][1]);     // -> 9
echo(v[search("p",v,1,0)[0]][1]);   // -> 3
echo(v[search("p",v,1,0)[0]][0]);   // -> "p"
echo(v[search("d",v,1,0)[0]][0]);   // "d" not found -> undef
echo(v[search("D",v,1,0)[0]][1]);   // -> 8
```

## OpenSCAD version

`version()` and `version_num()` returns the OpenSCAD version number.

The `version()` function returns the OpenSCAD version as a vector of three numbers, e.g. `[2011, 9, 23]`

The `version_num()` function returns the OpenSCAD version as a number, e.g. `20110923`

## parent_module(n) and $parent_modules

`$parent_modules` contains the number of modules in the instantiation stack. `parent_module(i)` returns the name of the module `i` levels above the current module in the instantiation stack. The stack is independent of where the modules are defined. It's where they're instantiated that counts.

This can, for example, be used to build a BOM (Bill Of Material).

**Example:**

```openscad
module top() {
    children();
}
module middle() {
    children();
}

top() middle() echo(parent_module(0)); // prints "middle"
top() middle() echo(parent_module(1)); // prints "top"
```

## assert

[Note: Requires version 2019.05]

see also Assertion (software development)

Assert evaluates a logical expression. If the expression evaluates to false, the generation of the preview/render is stopped, and an error condition is reported via the console. The report consists of a string representation of the expression and an additional string (optional) that is specified in the assert command.

```openscad
assert(condition);
assert(condition, message);
```

**Parameters**

- **condition** — Expression. The expression to be evaluated as check for the assertion.
- **message** — String. Optional message to be output in case the assertion failed.

### Example

The simplest example is a simple `assert(false);`, e.g. in a file named assert_example1.scad.

```openscad
cube();
assert(false);
sphere();
// ERROR: Assertion 'false' failed in file assert_example1.scad, line 2
```

This example has little use, but the simple `assert(false);` can be used in code sections that should be unreachable.

### Checking parameters

A useful example is checking the validity of input parameters:

```openscad
module row(cnt = 3){
    // Count has to be a positive integer greater 0
    assert(cnt > 0);
    for (i = [1 : cnt]) {
        translate([i * 2, 0, 0]) sphere();
    }
}

row(0);
// ERROR: Assertion '(cnt > 0)' failed in file assert_example2.scad, line 3
```

### Adding message

When writing a library, it could be useful to output additional information to the user in case of an failed assertion.

```openscad
module row(cnt = 3){
    assert(cnt > 0, "Count has to be a positive integer greater 0");
    for(i = [1 : cnt]) {
        translate([i * 2, 0, 0]) sphere();
    }
}

row(0);
// ERROR: Assertion '(cnt > 0)': "Count has to be a positive integer greater 0" failed in file assert_example3.scad, line 2
```

### Using assertions in function

Assert returns its children, so when using it in a function you can write:

```openscad
function f(a, b) =
    assert(a < 0, "wrong a")   // assert input
    assert(b > 0, "wrong b")   // assert input
    let (c = a + b)             // derive a new value from input
    assert(c != 0, "wrong c")  // assert derived value
    a * b;                      // calculate
```

---

# OpenSCAD User Manual/Modifier Characters

Modifier characters are used to change the appearance or behaviors of child nodes. They are particularly useful in debugging where they can be used to highlight specific objects, or include or exclude them from rendering.

OpenSCAD uses different libraries to implement capabilities, and this can introduce some inconsistencies to the F5 preview behavior of transformations. Traditional transforms (translate, rotate, scale, mirror & multimatrix) are performed using OpenGL in preview, while other more advanced transforms, such as resize, perform a CGAL operation, behaving like a CSG operation affecting the underlying object, not just transforming it. In particular this can affect the display of modifier characters, specifically "#" and "%", where the highlight may not display intuitively, such as highlighting the pre-resized object, but highlighting the post-scaled object.

> **Note:** The color changes triggered by character modifiers appear only in "Compile" mode, not "Compile and Render (CGAL)" mode. (As per the color section.)

## Background Modifier

```
% { ... }
```

Ignore this subtree for the normal rendering process and draw it in transparent gray (all transformations are still applied to the nodes in this tree).

Because the marked subtree is completely ignored, it might have unexpected effects in case it's used, for example, with the first object in a `difference()`. In that case this object is rendered in transparent gray, but it is not used as the base for the `difference()`!

**Example**

```openscad
difference() {
    cylinder (h = 12, r=5, center = true, $fn=100);
    // first object to be subtracted
    rotate ([90,0,0]) cylinder (h = 15, r=1, center = true, $fn=100);
    // second object to be subtracted
    %rotate ([0,90,0]) cylinder (h = 15, r=3, center = true, $fn=100);
}
```

| Output without the modifier. | Output with modifier added. | Rendered Model. |
|---|---|---|

## Debug Modifier

```
# { ... }
```

Use this subtree as usual in the rendering process but also draw it unmodified in transparent pink.

**Example**

```openscad
difference() {
    // start objects
    cylinder (h = 12, r=5, center = true, $fn=100);
    // first object to be subtracted
    #rotate ([90,0,0]) cylinder (h = 15, r=1, center = true, $fn=100);
    // second object to be subtracted
    #rotate ([0,90,0]) cylinder (h = 15, r=3, center = true, $fn=100);
}
```

| Output without the modifier. | Output with modifier added. |
|---|---|

## Root Modifier

```
! { ... }
```

Ignore the rest of the design and use this subtree as design root.

**Example**

```openscad
difference() {
    cube(10, center = true);
    translate([0, 0, 5]) {
        !rotate([90, 0, 0]) {
            #cylinder(r = 2, h = 20, center = true, $fn = 40);
        }
    }
}
```

| Output without the modifier. | Output with modifier added. |
|---|---|

As shown in the example output with the root modifier active, the `rotate()` is executed as it's part of the subtree marked with the root modifier, but the `translate()` has no effect.

## Disable Modifier

```
* { ... }
```

Simply ignore this entire subtree.

**Example**

```openscad
difference() {
    cube(10, center = true);
    translate([0, 0, 5]) {
        rotate([0, 90, 0]) {
            cylinder(r = 2, h = 20, center = true, $fn = 40);
        }
        *rotate([90, 0, 0]) {
            #cylinder(r = 2, h = 20, center = true, $fn = 40);
        }
    }
}
```

| Output without the modifier. | Output with modifier added. |
|---|---|

The disable modifier allows you to comment out one or multiple subtrees. Compared to using the usual line or multi-line comments, it's aware of the hierarchical structure, which makes it easier to disable even larger trees without the need to search for the end of the subtree.

## Echo statements

This function prints the contents to the compilation window (aka Console). Useful for debugging code. Also see the String function `str()`.

Numeric values are rounded to 5 significant digits.

It can be handy to use 'variable=variable' as the expression to easily label the variables, see the example below.

**Usage examples:**

```openscad
my_h=50;
my_r=100;
echo("This is a cylinder with h=", my_h, " and r=", my_r);
echo(my_h=my_h,my_r=my_r); // shortcut
cylinder(h=my_h, r=my_r);
```

Shows in the Console as:

```
ECHO: "This is a cylinder with h=", 50, " and r=", 100
ECHO: my_h = 50, my_r = 100
```


---

# OpenSCAD User Manual/Customizer

[Note: Requires version 2019.05]

The Customizer feature provides a graphic user interface for editing model parameters. With this feature one does not need to edit the code to change the values of the parameters / variables. Programmers can create templates for a given model, and customize these further to adapt to different needs / users. Sets of parameter values can also be saved, which effectively saves a variant of a particular model.

## Activation of Customizer panel

If the Customizer panel is not displayed, use the menu toggle Window > Hide customizer to make it visible.

## Supported Variables

The customizer displays all variables that meet the following criteria:

- The variable is assigned in the main file. Customizer will not display variables from files brought in via include and use (though with include, they can still be referenced in the calling script).
- The variable has a simple literal value -- string, number, or boolean -- or a list of up to four numeric literals.
- The variable is not assigned in a "Hidden" section, as defined by a line containing only the comment `/* [Hidden] */` (details below).
- The assignment statement must appear before the first `{` syntax element. Some scripts contain an empty module near the top for just this purpose, for instance:

```openscad
module __Customizer_Limit__ () {} // Hide following assignments from Customizer.
debug_mode = false;
```

Because it appears after a `{`, the Customizer does not display the variable `debug_mode`. This is an old-fashioned way of ending the list of customizable parameters -- the comment `/* [Hidden] */` is considered a best-practice way to do this now.

Note: It is possible to enter a module or function containing no `{` character, which would not stop the Customizer from displaying subsequent variables.

```openscad
module does_not_stop_customizer () echo("Some text");
shown_by_customizer = true; 	// still displayed by Customizer
```

As mentioned above, only simple literals and arrays of up to four numbers are available as parameters. Examples for literals are:

```openscad
a = "Text";
b = 123;
c = 456.789;
d = [1,2,3,4];
```

Expressions (even trivial examples) like

```openscad
e = str("String"," ","concat");
f = 12 + 0.5;
```

are not supported as parameters.

The description comment must be adjusted to the left column of the source file, without spaces.

## Syntax support for generation of the customization form

Following is the syntax for how to define different types of widgets in the form:

```
// variable description
variable name = defaultValue; // possible values
```

### Drop down box

```openscad
// combo box for number
Numbers=2; // [0, 1, 2, 3]

// combo box for string
Strings="foo"; // [foo, bar, baz]

//labeled combo box for numbers
Labeled_values=10; // [10:S, 20:M, 30:L]

//labeled combo box for string
Labeled_value="S"; // [S:Small, M:Medium, L:Large]
```

### Slider

Only numbers are allowed in this one, specify any of the following:

```openscad
// slider widget for number with max. value
sliderWithMax =34; // [50]

// slider widget for number in range
sliderWithRange =34; // [10:100]

//step slider for number
stepSlider=2; //[0:5:100]

// slider widget for number in range
sliderCentered =0; // [-10:0.1:10]

// slider widget for number with max. value
sliderWithMax =34; // [50]
```

### Checkbox

```openscad
//description
Variable = true;
```

### Spinbox

```openscad
// spinbox with step size 1
Spinbox= 5;

// spinbox with step size 0.5
Spinbox= 5.5; // .5
```

### Textbox

Note that this is mainly for compatibility with Thingiverse (http://www.thingiverse.com)

NOTE: The text box example only works in release version 2021.01, it may not work in future versions!

```openscad
// Text box for string
String="hello";

// Text box for string with length 8
String="length"; //8
```

Not supported by Thingiverse.

### Special vector

```openscad
//Spin box box for vector with less than or equal to 4 elements
Vector2=[12,34];
Vector3=[12,34,45];
Vector4=[12,34,45,23];
```

You can also set a range for the vector:

```openscad
VectorRange3=[12,34,46]; //[1:2:50]
VectorRange4=[12,34,45,23]; //[1:50]
```

### Unavailable customizations

Some desirable customization constraints are not supported currently.

- Multi-line text boxes.
- Directly editable (non-spinbox) numeric values:

```openscad
SerialNumber = 0; //[::non-negative integer]
Offset = 10.0; //[::float]
```

## Creating Tabs

Parameters can be grouped into tabs. This feature allows related parameters to be associated into groups. The syntax is very similar the Thingiverse rules for tabs. To create a tab, use a multi-line block comment like this:

```openscad
/* [Tab Name] */
```

Also possible, but not recommended:

```openscad
/* [Tab] [Name] */
```

Three tabs names have a special functionality;

### [Global]

Parameters in the Global tab are always shown on every tab no matter which tab is selected. No tab is shown for Global parameters; they appear in all the tabs.

### [Hidden]

Parameters in the Hidden tab (with first letter uppercase) are never displayed. Not even the tab is shown. This prevents global variables that have not been parameterized for the Thingiverse or OpenSCAD Customizer from showing up in the Customizer interface or widget. Included for compatibility with Thingiverse.

You can have multiples segments under the Hidden group. See also [hidden parameters](#hidden-parameters).

### parameters

Parameters that are not under any tab are displayed under a tab named "parameters". In Thingiverse, these parameters are listed with no tab.

## Example showcasing most features

```openscad
/* [Drop down box:] */
// combo box for number
Numbers=2; // [0, 1, 2, 3]

// combo box for string
Strings="foo"; // [foo, bar, baz]

//labeled combo box for numbers
Labeled_values=10; // [10:L, 20:M, 30:XL]

//labeled combo box for string
Labeled_value="S"; // [S:Small, M:Medium, L:Large]

/*[ Slider ]*/
// slider widget for number
slider =34; // [10:100]

//step slider for number
stepSlider=2; //[0:5:100]

/* [Checkbox] */
//description
Variable = true;

/*[Spinbox] */
// spinbox with step size 1
Spinbox = 5;

/* [Textbox] */
// Text box for string
String="hello";

/* [Special vector] */
//Text box for vector with less than or equal to 4 elements
Vector1=[12]; //[0:2:50]
Vector2=[12,34]; //[0:2:50]
Vector3=[12,34,46]; //[0:2:50]
Vector4=[12,34,46,24]; //[0:2:50]

/* [Hidden] */
debugMode = true;
```

## Saving Parameters value in JSON file

This feature gives the user the ability to save the values of all parameters. JSON parameter values can be then reused through the command line.

### Cmdline

`-p` is used to give input JSON file in which parameters are saved.

`-P` is used to give the name of the set of the parameters written in JSON file.

```
openscad -o model-2.stl -p parameters.json -P model-2 model.scad
```

```
openscad -o <output-file> -p <parameteric-file (JSON File) > -P <NameOfSet> <input-file SCAD file >
```

And JSON file is written in the following format:

```json
{
  "parameterSets": {
    "set-name ": {
      "parameter-name ": "value ",
      "parameter-name ": "value "
    },
    "set-name ": {
      "parameter-name ": "value ",
      "parameter-name ": "value "
    }
  },
  "fileFormatVersion": "1"
}
```

Example:

```json
{
  "parameterSets": {
    "FirstSet": {
      "Labeled_values": "13",
      "Numbers": "18",
      "Spinbox": "35",
      "Vector": "[2, 34, 45, 12, 23, 56]",
      "slider": "2",
      "stepSlider": "12",
      "string": "he"
    },
    "SecondSet": {
      "Labeled_values": "10",
      "Numbers": "8",
      "Spinbox": "5",
      "Vector": "[12, 34, 45, 12, 23, 56]",
      "slider": "12",
      "stepSlider": "2",
      "string": "hello"
    }
  },
  "fileFormatVersion": "1"
}
```

### GUI

Through GUI you can easily apply and save Parameter in JSON file using Present section in Customizer explained below.

In customizer, the first line of options is as follows:

1. **Automatic Preview**: If checked, the preview of the model is automatically updated when you change any parameter in Customizer, else you must click the preview button or press F5 after you update parameters in the Customizer.
2. **Show Details**:
   1. **Show Details**: If chosen, the description for the parameter appears below the parameter name.
   2. **Inline Details**: If chosen, the description for the parameter appears next to the parameter name. Long descriptions get clipped. This option is a compromise between vertical space usage and retaining part of the description.
   3. **Hide Details**: Details are suppressed although you still can view the description by hovering the cursor over the input widget.
3. **Reset button**: When clicked, it resets the values of all input widgets for the parameter to the defaults provided in SCAD file.

Next comes Preset section: It consist of four buttons:

- **combo Box** — It is used to select the set of parameters to be used
- **+ button** — add new set of the parameters
- **– button** — It is used to delete the set selected in combo Box.
- **save preset button** — save/overwrite the current preset

and finally below Preset Section is the Place where you can play with the parameters.

## Manually create datasets

You can manually create a dataset by modifying the JSON file according above format and defining your own variables. When a dataset is loaded, only the parameters defined in the dataset are modified, other parameters are not set to defaults. This allow one to create partial datasets consisting of modifiers, not complete dataset.

## Hidden parameters

Variables belonging to the hidden group are stored in the JSON file, but are not retrieved from the JSON file.

Meaning: If a variable is moved from the hidden group to an other group, it also becomes applicable. This allows a designer to use the hidden group for reserved variables, that become customizable (and assigned with a different default) in a future version, without breaking existing preset.

A hidden variable can also be used as a "last saved with" indicator, that can be read by manually viewing the JSON file.

The idea is, that the customizer only modifies variables that the user can see and control from the customizer UI.

## Tips and Tricks

### Set Range and Stepping

The customizer tries to guess an appropriate range and stepping, but may give inconsistent results depending on your design intent. For example, the customizer also treats numbers like 0.0, 1.0, 2.0 etc. as integers. The customizer also does not know whether negative numbers make sense. It is therefore recommended to supply range and step as comments. Keep in mind, that if in doubt, the user can always modify the SCAD file.

Do not hesitate to limit the range. For instance, in the design of a smart phone holder, limit the size to reasonable smart phone sizes. If someone wants to use your smart phone holder as a tablet holder, he always can directly edit the SCAD file itself. This act also makes the user aware, that the design was not meant as a tablet holder and that he or she might need for example to modify the support structure.

### Scroll Wheel

The buttons on the spinboxes are small, but you can use the scroll wheel on your mouse to change the value comfortably. First, click on the spin box to focus the spin box.

### color =

```openscad
cubeColor = [1,0.5,0]; //[0:0.1:1]
sphereColor = "blue"; // [red, green, blue]
echo(cubeColor);
color(cubeColor)
  cube();
color(sphereColor)
  sphere();
```

## Examples

You can also refer to two examples that are Part of OpenSCAD to learn more:

1. Parametric/sign.scad
2. Parametric/candlStand.scad

## Notes

I saved the Thingiverse Customizer documentation, originally here (https://customizer.makerbot.com/docs), to the Internet Archive here (https://web.archive.org/web/20211027060014/https://customizer.makerbot.com/docs), just in case.

---

# OpenSCAD User Manual/Importing Geometry

Importing is achieved by the `import()` command.

[Note: Requires version 2015.03-2] The File >> Open command may be used to insert this command. The file type filter of the Open File dialog may show only OpenSCAD files, but file name can be replaced with a wildcard (e.g. *.stl) to browse to additional file types.

## import

Imports a file for use in the current OpenSCAD model. The file extension is used to determine which type.

**3D geometry formats**

- STL (both ASCII and Binary)
- OFF
- OBJ
- AMF (deprecated)
- 3MF

**2D geometry formats**

- DXF
- PDF
- SVG

**Data formats**

- JSON [Note: Requires version Development snapshot]

**Other**

- CSG can be imported using `include<>` or loaded like an SCAD file
- PNG can be imported using `surface()`

### Parameters

**\<file\>**
A string containing the path to file. If the given path is not absolute, it is resolved relative to the importing script. Note that when using `include<>` with a script that uses `import()`, this is relative to the script doing the `include<>`.

**\<center\>**
Boolean. If true, the center of the object is placed at the origin. [Note: Requires version Development snapshot]

**\<convexity\>**
An Integer. The convexity parameter specifies the maximum number of front sides (or back sides) a ray intersecting the object might penetrate. This parameter is needed only for correctly displaying the object in OpenCSG preview mode and has no effect on the polyhedron rendering. Optional.

**\<id\>**
String. For SVG import only, the id of an element or group to import. Optional. Elements in an SVG can have both an ID and a Label, and the label will not work here. In your vector editing program, examine the object's properties to find (or assign) the ID. [Note: Requires version Development snapshot]

**\<layer\>**
For DXF and SVG import only, specify a specific layer to import. Optional.

**$fn**
Double. The number of polygon segments to use when converting circles, arcs, and curves to polygons. [Note: Requires version Development snapshot]

**$fa**
Double. The minimum angle step to use when converting circles and arcs to polygons. [Note: Requires version Development snapshot]

**$fs**
Double. The minimum segment length to use when converting circles and arcs to polygons. [Note: Requires version Development snapshot]

```openscad
import("example012.stl", convexity=3);
import("D:/Documents and Settings/User/My Documents/Gear.stl", convexity=3);
```

(Windows users must "escape" the backslashes by writing them doubled, or replace the backslashes with forward slashes.)

```openscad
data = import("data.json"); // for data formats the file content is assigned to a variable
```

### Convexity

Read a layer of a 2D DXF file and create a 3D shape.

```openscad
linear_extrude(height = 5, center = true, convexity = 10)
  import_dxf(file = "example009.dxf", layer = "plate");
```

This image shows a 2D shape with a convexity of 2, as the ray indicated in red intersects with the 2D shape in at most two sections. The convexity of a 3D shape would be determined in a similar way. Setting it to 10 should work fine for most cases.

### Notes

In the latest version of OpenSCAD, `import()` is now used for importing both 2D (DXF for extrusion) and 3D (STL) files.

If you want to render the imported STL file later, you have to make sure that the STL file is "clean". This means that the mesh has to be manifold and should not contain holes nor self-intersections. If the STL is not clean, it might initially import and preview fine, but then as soon as you attempt to perform computational geometry on it by rendering a combination of it with something else, you might get warnings about it not being manifold, your imported stl might disappear from the output entirely, or you might get errors like:

```
CGAL error in CGAL_Build_PolySet: CGAL ERROR: assertion violation!
Expr: check_protocoll == 0
File: /home/don/openscad_deps/mxe/usr/i686-pc-mingw32/include/CGAL/Polyhedron_incremental_builder_3.h
Line: 199
```

or

```
CGAL error in CGAL_Nef_polyhedron3(): CGAL ERROR: assertion violation!
Expr: pe_prev->is_border() || !internal::Plane_constructor<Plane>::get_plane(pe_prev->facet(),pe_prev->facet()->plane()).is_degenerate()
File: /home/don/openscad_deps/mxe/usr/i686-pc-mingw32/include/CGAL/Nef_3/polyhedron_3_to_nef_3.h
Line: 253
```

In order to clean the STL file, you have the following options:

- use http://wiki.netfabb.com/Semi-Automatic_Repair_Options to repair the holes but not the self-intersections.
- use netfabb basic. This free software doesn't have the option to close holes nor can it fix the self-intersections.
- use MeshLab, This free software can fix all the issues.

Using MeshLab, you can do:

1. Render - Show non Manif Edges
2. Render - Show non Manif Vertices
3. if found, use Filters - Selection - Select non Manifold Edges or Select non Manifold Vertices - Apply - Close. Then click button 'Delete the current set of selected vertices...' or check http://www.youtube.com/watch?v=oDx0Tgy0UHo for an instruction video. The screen should show "0 non manifold edges", "0 non manifold vertices"
4. Next, you can click the icon 'Fill Hole', select all the holes and click Fill and then Accept. You might have to redo this action a few times.
5. Use File - Export Mesh to save the STL.

If Meshlab can't fill the last hole then Blender might help:

1. Start Blender
2. `X, 1` to remove the default object
3. File, Import, Stl
4. `Tab` to edit the mesh
5. `A` to de-select all vertices
6. `Alt+Ctrl+Shift+M` to select all non-manifold vertices
7. `MMB` to rotate, `Shift+MMB` to pan, `wheel` to zoom
8. `C` for "circle" select, `Esc` to finish
9. `Alt+M, 1` to merge or `Space` and search for "merge" as alternative
10. Merging vertices is a useful way of filling holes where the vertices are so closely packed that the slight change in geometry is unimportant compared to the precision of a typical 3D printer

## Importing JSON

This requires enabling import-function feature in development build. If you import a file with the suffix "json" or "csv", import returns a JSON-object datatype which there is not a way to express as a literal value -- it can only be imported.

Note: Files with the ".csv" file suffix are also treated as JSON files, though these formats are not the same -- a CSV file saved from a spreadsheet program cannot be used here.

```openscad
/* input file contains:
{"people":[{"name":"Helen", "age":19}, {"name":"Chris", "age":32}]}
*/
t = import("people.json");
echo(t);
people = t.people;
for(i=[0:len(people)-1]) {
  person = people[i];
  echo(str(person.name, ": ", person.age));
}
```

Which results in this output:

```
ECHO: { people = [{ age = 19; name = "Helen"; }, { age = 32; name = "Chris"; }]; }
ECHO: "Helen: 19"
ECHO: "Chris: 32"
```

## import_dxf

[Deprecated: import_dxf() is deprecated and will be removed in a future release. Use import() instead.]

Read a DXF file and create a 3D shape.

```openscad
linear_extrude(height = 5, center = true, convexity = 10)
  import_dxf(file = "example009.dxf", layer = "plate");
```

## import_stl

[Deprecated: import_stl() is deprecated and will be removed in a future release. Use import() instead.]

Imports an STL file for use in the current OpenSCAD model

```openscad
import_stl("body.stl", convexity = 5);
```

## surface

`surface()` reads Heightmap information from text or image files. It can read PNG files.

### Parameters

**file**
String. The path to the file containing the heightmap data.

**center**
Boolean. This determines the positioning of the generated object. If true, object is centered in X- and Y-axis. Otherwise, the object is placed in the positive quadrant. Defaults to false.

**invert**
Boolean. Inverts how the color values of imported images are translated into height values. This has no effect when importing text data files. Defaults to false. [Note: Requires version 2015.03]

**convexity**
Integer. The convexity parameter specifies the maximum number of front sides (back sides) a ray intersecting the object might penetrate. This parameter is needed only for correct display of the object in OpenCSG preview mode and has no effect on the final rendering.

### Text file format

The format for text based height maps is a matrix of numbers that represent the height for a specific point. Rows are mapped to the Y-axis, columns to the X axis. The numbers must be separated by spaces or tabs. Empty lines and lines starting with a `#` character are ignored.

### Images

[Note: Requires version 2015.03]

Currently only PNG images are supported. Alpha channel information of the image is ignored and the height for the pixel is determined by converting the color value to Grayscale using the linear luminance for the sRGB color space (Y = 0.2126R + 0.7152G + 0.0722B). The gray scale values are scaled to be in the range 0 to 100.

### Examples

**Example 1:**

```openscad
//surface.scad
surface(file = "surface.dat", center = true, convexity = 5);
%translate([0,0,5])cube([10,10,10], center =true);
```

```
#surface.dat
10 9 8 7 6 5 5 5 5 5
9 8 7 6 6 4 3 2 1 0
8 7 6 6 4 3 2 1 0 0
7 6 6 4 3 2 1 0 0 0
6 6 4 3 2 1 1 0 0 0
6 6 3 2 1 1 1 0 0 0
6 6 2 1 1 1 1 0 0 0
6 6 1 0 0 0 0 0 0 0
3 1 0 0 0 0 0 0 0 0
3 0 0 0 0 0 0 0 0 0
```

**Example 2:**

```openscad
// example010.dat generated using octave:
// d = (sin(1:0.2:10)' * cos(1:0.2:10)) * 10;
// save("example010.dat", "d");
intersection() {
  surface(file = "example010.dat", center = true, convexity = 5);
  rotate(45, [0, 0, 1]) surface(file = "example010.dat", center = true, convexity = 5);
}
```

**Example 3:**

[Note: Requires version 2015.03]

```openscad
// Example 3a
scale([1, 1, 0.1])
  surface(file = "smiley.png", center = true);

// Example 3b
scale([1, 1, 0.1])
  surface(file = "smiley.png", center = true, invert = true);
```

| Input image | Example 3a: surface(invert = false) | Example 3b: surface(invert = true) |
|---|---|---|

Example 3: Using surface() with a PNG image as heightmap input.

---

# OpenSCAD User Manual/Export

The current OpenSCAD model can be exported in different formats. The list of supported formats depends on the geometry, if the final design is a 3D or 2D model.

OpenSCAD can export:

**3D formats**

- STL (ASCII only)
- OFF
- AMF [Note: Requires version 2015.03]
- 3MF [Note: Requires version 2019.05]

**2D formats**

- DXF
- SVG [Note: Requires version 2015.03]
- PNG (Image) [Note: Requires version 2019.05]
- PDF (A4 size only) [Note: Requires version 2021.01]

**Other**

- CSG which is a simplified representation of the SCAD script

---

# OpenSCAD User Manual/Libraries

OpenSCAD uses three library locations, the installation library, built-in library, and user-defined libraries.

## Library locations

1. The **Installation library** location is the libraries directory under the directory where OpenSCAD is installed.
2. The **Built-In library** location is O/S dependent. Since version 2014.03, it can be opened in the system specific file manager using the "File->Show Library Folder..." menu entry.
   - Windows: `My Documents\OpenSCAD\libraries`
   - Linux: `$HOME/.local/share/OpenSCAD/libraries`
   - Mac OS X: `$HOME/Documents/OpenSCAD/libraries`
3. The **User-Defined library** path can be created using the `OPENSCADPATH` Environment Variable to point to the library(s). `OPENSCADPATH` can contain multiple directories in case you have library collections in more than one place, separate directories with a semi-colon for Windows, and a colon for Linux/Mac OS. For example:
   - Windows: `C:\Users\A_user\Documents\OpenSCAD\MyLib;C:\Thingiverse Stuff\OpenSCAD Things;D:\test_stuff`

     (Note: For Windows, in versions prior to 2014.02.22 there is a bug preventing multiple directories in OPENSCADPATH as described above, it uses a colon (:) to separate directories. A workaround, if your libraries are on C: is to leave off the drive letter & colon, e.g. `\Thingiverse Stuff\OpenSCAD Things:\stuff`. For more about setting Windows environment variables, see [User Environment Variables](https://msdn.microsoft.com/en-us/library/windows/desktop/bb776899(v=vs.85).aspx).)

   - Linux/Mac OS: `/usr/lib:/home/mylib:.`

OpenSCAD must be restarted to recognize any change to the `OPENSCADPATH` Environment Variable.

When you specify a non-fully qualified path and filename in the `use <...>` or `include <...>` statement OpenSCAD looks for the file in the following directories in the following order:

1. the directory of the calling .scad file
2. the User-Defined library paths (OPENSCADPATH)
3. the Built-In library (i.e. the O/S dependent locations above)
4. the Installation library

In the case of a library file itself having `use <...>` or `include <...>` the directory of the library .scad file is the 'calling' file, i.e. when looking for libraries within a library, it does not check the directory of the top level .scad file.

For example, with the following locations and files defined: (with OPENSCADPATH=/usr/lib:/home/lib_os:.)

```
1. <installation library>/lib1.scad
2. <built-in library>/lib2.scad
3. <built-in library>/sublib/lib2.scad
4. <built-in library>/sublib/lib3.scad
5. /usr/lib/lib2.scad
6. /home/lib_os/sublib/lib3.scad
```

The following `include <...>` statements match to the nominated library files:

```openscad
include <lib1.scad>         // #1.
include <lib2.scad>         // #5.
include <sublib/lib2.scad>  // #3.
include <sublib/lib3.scad>  // #6.
```

Since 2014.03, the currently active list of locations can be verified in the "Help->Library Info" dialog.

The details info shows both the content of the OPENSCADPATH variable and the list of all library locations. The locations are searched in the order they appear in this list. For example;

```
OPENSCADPATH: /data/lib1:/data/lib2
OpenSCAD library path:
  /data/lib1
  /data/lib2
  /home/user/.local/share/OpenSCAD/libraries
  /opt/OpenSCAD/libraries
```

Note: The page on PATHS covers how personal settings for other resources may be set up for OpenSCAD.

## Setting OPENSCADPATH

### Windows

Windows 11, any version

The environment variable editor is accessed from the Control Panel > System > About panel

- Right Click This PC icon on the desktop
- OR Start Menu > Settings > System > (scroll down) About
- OR Start Menu > Settings and search for "env" - then skip to Click the New.. below

Next - scroll down to between Device Specifications and Windows Specifications

1. Select Advanced System Options of the four tabs
2. A pop-up will let you confirm that you allow access to admin level System Properties.
3. Select the Advanced Tab, then the Environment Variables button
4. Best to set OPENSCADPATH as a personal env var, rather than a System Variable.
5. Click the New... button
6. In the popup set `OPENSCADPATH` as the new name
7. set `%USERPROFILE%\Documents\OpenSCAD\libraries` and the content

Note: The folder `~/AppData/Local/OpenSCAD/` is not normally used by OpenSCAD for libraries

### On Linux

The environment variable may be set for all users by using a command (as follows) to append the definition to the end of the global profile definition file in a terminal session

Info: the use of sudo gives the required admin privilege to the command so be prepared with the admin password

**shell**

```sh
sudo sh -c 'echo "OPENSCADPATH=$HOME/openscad/libraries" >>/etc/profile'
```

**bash**

```bash
sudo bash -c 'echo "export OPENSCADPATH=$HOME/openscad/libraries" >>/etc/profile'
```

**zsh**

```zsh
sudo zsh -c 'echo "export OPENSCADPATH=$HOME/openscad/libraries" >>/etc/profile'
```

**csh**

```csh
sudo csh -c 'echo "setenv OPENSCADPATH $HOME/openscad/libraries" >>/etc/csh.cshrc'
```

Warning: the shell profile setup files .bashrc or .zshrc are only used when starting new interactive sessions. Variables that should be available for headless operations, like OPENSCADPATH, should be set as suggested above.

Or, the variable may be set only for one's own account without sudo:

**shell**

```sh
sh -c 'echo "OPENSCADPATH=$HOME/openscad/libraries" >>~/profile'
```

**bash**

```bash
bash -c 'echo "export OPENSCADPATH=$HOME/openscad/libraries" >>~/.bash_profile'
```

**zsh**

```zsh
zsh -c 'echo "export OPENSCADPATH=$HOME/openscad/libraries" >>~/.zprofile'
```

**csh**

```csh
csh -c 'echo "setenv OPENSCADPATH $HOME/openscad/libraries" >>~/.cshrc'
```

If there is a chance that OPENSCADPATH has been set globally, and the personal folder should be appended to the global PATH, change the definition to something like:

```sh
export OPENSCADPATH=$OPENSCADPATH:~/.config/openscad/libraries
```

OR perhaps

```sh
export OPENSCADPATH=$OPENSCADPATH:$XDG_CONFIG_HOME/openscad/libraries
```

### Mac OS X

To set the OPENSCADPATH globally so that it is set for all users to a folder in each users' home folder give this command in a terminal window:

```sh
launchctl setenv OPENSCADPATH "$HOME/my/own/path"
```

For more control on environment variables, you'll need to edit the configuration files; see for example [this page](http://unix.stackexchange.com/questions/117467/how-to-permanently-set-environmental-variables).

On Mac, you need to modify the `/etc/launchd.conf`:

```sh
sudo sh -c 'echo "setenv OPENSCADPATH /Users/myuser/my/own/path" >>/etc/launchd.conf'
```

The variable will be available at next reboot.

To avoid to reboot and use it immediately, issue the following commands:

```sh
egrep "^setenv\ " /etc/launchd.conf | xargs -t -L 1 launchctl
killall Dock
killall Spotlight
```

## MCAD

OpenSCAD bundles the [MCAD library](https://github.com/openscad/MCAD).

There are many different forks floating around (e.g. [1](https://github.com/SolidCode/MCAD), [2](https://github.com/elmom/MCAD), [3](https://github.com/benhowes/MCAD)) many of them unmaintained.

MCAD bundles a lot of stuff, of varying quality, including:

- Many common shapes like rounded boxes, regular polygons and polyhedra in 2D and 3D
- Gear generator for involute gears and bevel gears.
- Stepper motor mount helpers, stepper and servo outlines
- Nuts, bolts and bearings
- Screws and augers
- Material definitions for common materials
- Mathematical constants, curves
- Teardrop holes and polyholes

The git repo also contains python code to scrape OpenSCAD code, a testing framework and SolidPython, an external python library for solid cad.

More details on using MCAD are in a later chapter, OpenSCAD User Manual/MCAD.

## Other libraries

- [Belfry OpenScad Library](https://github.com/revarbat/BOSL) has many shapes, masks, manipulators, and support for threading, gears, polylines and beziers.
- [Bevel library](https://www.thingiverse.com/thing:30336) for OpenScad
- [BOLTS](https://github.com/boltsparts/boltsparts) tries to build a standard part and vitamin library that can be used with OpenSCAD and other CAD tools.
- [Celtic knot library](https://github.com/beanz/celtic-knot-scad) is used for the generation of celtic knots.
- [Colorspace converter](http://www.thingiverse.com/thing:279951/) for working with colors in HSV and RGB.
- [Dimensioned Drawings](https://www.cannymachines.com/entries/9/openscad_dimensioned_drawings) provides tools to create proper 2D technical drawings of your 3D objects.
- [DotSCAD](https://github.com/JustinSDK/dotSCAD) comprehensive library of 2D and 3D operations and transforms including extrusion along arbitrary paths, shape bending, etc.
- [Fillets](https://github.com/StephS/i2_xends/blob/master/inc/fillets.scad), a comprehensive fillets library by [Stephanie Shaltes](https://plus.google.com/u/0/101448691399929440302).
- [Local.scad](https://github.com/jreinhardt/local-scad) provides a flexible method for positioning parts of a design. Is also used in BOLTS.
- [Michigan Tech's Open Sustainability Technology Lab (MOST) libraries](https://github.com/mtu-most/most-scad-libraries)
- [Obiscad](https://github.com/Obijuan/obiscad) contains various useful tools, notably a framework for attaching modules on other modules in a simple and modular way.
- [OpenSCAD threads](http://dkprojects.net/openscad-threads/) library: provides ISO conform metric and imperial threads and support internal and external threads and multiple starts.
- [Pinball Library](https://code.google.com/p/how-to-build-a-pinball/source/browse/trunk/scad/pinball): provides many components for pinball design work, including models for 3d printing of the parts, 3d descriptions of mount holes for CNC drilling and 2d descriptions of parts footprint.
- [Regular shapes library](https://github.com/elmom/MCAD/blob/master/regular_shapes.scad) by Giles Bathgates: provides regular polygons and polyeders and is included in MCAD.
- [Roller Chain Sprockets OpenSCAD Module](http://www.thingiverse.com/thing:197896) lets you create sprockets for ANSI chains and motorcycle chains. Contains hard coded fudge factors, may require tweaking.
- [SCADBoard](http://scadboard.wordpress.com/) is a library for designing 3D printed PCBs in OpenSCAD.
- [Shapes library](http://svn.clifford.at/openscad/trunk/libraries/shapes.scad) contains many shapes like rounded boxes, regular polygons. It is also included in MCAD.
- [The 2D connection library](https://www.youmagine.com/designs/openscad-2d-connection-library) helps with connections between 2D sheets, which is useful for laser cut designs.
- [Ruler](http://www.thingiverse.com/thing:30769) helps in determining the size of things in OpenSCAD.
- [Knurled surface library](http://www.thingiverse.com/thing:9095) by aubenc
- [Text module](https://github.com/thestumbler/alpha) based on technical lettering style.
- [Round corners for Openscad](https://www.makerbot.com/media-center/2011/05/26/script-for-rounded-corners-for-openscad-by-warrantyvoider), also at https://www.thingiverse.com/thing:8812
- [Unit test framework](https://github.com/oampo/testcard)
- [Utility function](https://github.com/oampo/missile) collection.
- [Workflow library](https://github.com/UBaer21/UB.scad): full workflows, by Ulrich Bär

There is also a list with more libraries here: https://github.com/openscad/openscad/wiki/Libraries

## Other OpenSCAD tutorials and documentation

- "OpenSCAD User Manual" http://www.openscad.org/documentation.html
- "Know only 10 things to be dangerous in OpenSCAD" https://cubehero.com/2013/11/19/know-only-10-things-to-be-dangerous-in-openscad/
- "OpenScad beginners tutorial" http://edutechwiki.unige.ch/en/OpenScad_beginners_tutorial
- "How to use Openscad, tricks and tips to design a parametric 3D object" http://www.tridimake.com/2014/09/how-to-use-openscad-tricks-and-tips-to.html
- OpenSCAD discussion forum http://forum.openscad.org


---

# OpenSCAD User Manual/Using OpenSCAD in a command line environment

OpenSCAD can not only be used as a GUI, but also handles command line arguments.

OpenSCAD (DEV/nightly) 2025.08.17 has these options

```
Usage: openscad.exe [options] file.scad
```

**Allowed options:**

| Option | Description |
|---|---|
| `--export-format arg` | overrides format of exported scad file when using option '-o', arg can be any of its supported file extensions. For ascii stl export, specify 'asciistl', and for binary stl export, specify 'binstl'. Ascii export is the current stl default, but binary stl is planned as the future default so asciistl should be explicitly specified in scripts when needed. |
| `-o [ --o ] arg` | output specified file instead of running the GUI. The file extension specifies the type: stl, off, wrl, amf, 3mf, csg, dxf, svg, pdf, png, echo, ast, term, nef3, nefdbg, param, pov. May be used multiple times for different exports. Use '-' for stdout. |
| `-O [ --O ] arg` | pass settings value to the file export using the format section/key=value, e.g export-pdf/paper-size=a3. Use --help-export to list all available settings. |
| `-D [ --D ] arg` | var=val -pre-define variables |
| `-p [ --p ] arg` | customizer parameter file |
| `-P [ --P ] arg` | customizer parameter set |
| `--enable arg` | enable experimental features (specify 'all' for enabling all available features): roof \| input-driver-dbus \| lazy-union \| vertex-object-renderers-indexing \| textmetrics \| import-function \| predictible-output |
| `-h [ --help ]` | print this help message and exit |
| `--help-export` | print list of export parameters and values that can be set via -O |
| `-v [ --version ]` | print the version |

## Command line usage

| Option | Description |
|---|---|
| `--info` | print information about the build process |
| `--camera arg` | camera parameters when exporting png: =translate_x,y,z,rot_x,y,z,dist or =eye_x,y,z,center_x,y,z |
| `--autocenter` | adjust camera to look at object's center |
| `--viewall` | adjust camera to fit object |
| `--backend arg` | 3D rendering backend to use: 'CGAL' (old/slow) [default] or 'Manifold' (new/fast) |
| `--imgsize arg` | =width,height of exported png |
| `--render arg` | for full geometry evaluation when exporting png |
| `--preview arg` | [=throwntogether] -for ThrownTogether preview png |
| `--animate arg` | export N animated frames |
| `--animate_sharding arg` | Parameter \<shard\>/\<num_shards\> - Divide work into \<num_shards\> and only output frames for \<shard\>. E.g. 2/5 only outputs the second 1/5 of frames. Use to parallelize work on multiple cores or machines. |
| `--view arg` | =view options: axes \| crosshairs \| edges \| scales |
| `--projection arg` | =(o)rtho or (p)erspective when exporting png |
| `--csglimit arg` | =n -stop rendering at n CSG elements when exporting png |
| `--summary arg` | enable additional render summary and statistics: all \| cache \| time \| camera \| geometry \| bounding-box \| area |
| `--summary-file arg` | output summary information in JSON format to the given file, using '-' outputs to stdout |
| `--colorscheme arg` | =colorscheme: \*Cornfield \| Metallic \| Sunset \| Starnight \| BeforeDawn \| Nature \| Daylight Gem \| Nocturnal Gem \| DeepOcean \| Solarized \| Tomorrow \| Tomorrow Night \| ClearSky \| Monotone |
| `-d [ --d ] arg` | deps_file -generate a dependency file for make |
| `-m [ --m ] arg` | make_cmd -runs make_cmd file if file is missing |
| `-q [ --quiet ]` | quiet mode (don't print anything *except* errors) |
| `--hardwarnings` | Stop on the first warning |
| `--trace-depth arg` | =n, maximum number of trace messages |
| `--trace-usermodule-parameters arg` | =true/false, configure the output of user module parameters in a trace |
| `--check-parameters arg` | =true/false, configure the parameter check for user modules and functions |
| `--check-parameter-ranges arg` | =true/false, configure the parameter range check for builtin modules |
| `--debug arg` | special debug info - specify 'all' or a set of source file names |
| `-s [ --s ] arg` | stl_file deprecated, use -o |
| `-x [ --x ] arg` | dxf_file deprecated, use -o |

## Export help

OpenSCAD version 2025.08.17

List of settings that can be given using the -O option using the format '\<section\>/\<key\>=value', e.g.:

```
openscad -O export-pdf/paper-size=a6 -O export-pdf/show-grid=false
```

**Section 'export-pdf':**

| Setting | Type | Values |
|---|---|---|
| paper-size | enum | [a6,a5,\<a4\>,a3,letter,legal,tabloid] |
| orientation | enum | [\<portrait\>,landscape,auto] |
| show-filename | bool | \<true\>/false |
| show-scale | bool | \<true\>/false |
| show-scale-message | bool | \<true\>/false |
| show-grid | bool | \<true\>/false |
| grid-size | double | 1.000000 : \<10.000000\> : 100.000000 |
| add-meta-data | bool | \<true\>/false |
| meta-data-title | string | "" |
| meta-data-author | string | "" |
| meta-data-subject | string | "" |
| meta-data-keywords | string | "" |

**Section 'export-3mf':**

| Setting | Type | Values |
|---|---|---|
| color-mode | enum | [\<model\>,none,selected-only] |
| unit | enum | [micron,\<millimeter\>,centimeter,meter,inch,foot] |
| color | string | "#f9d72c" |
| material-type | enum | [color,\<basematerial\>] |
| decimal-precision | int | 1 : \<6\> : 16 |
| add-meta-data | bool | \<true\>/false |
| meta-data-title | string | "" |
| meta-data-designer | string | "" |
| meta-data-description | string | "" |
| meta-data-copyright | string | "" |
| meta-data-license-terms | string | "" |
| meta-data-rating | string | "" |

---

OpenSCAD 2021.01 has these options

```
Usage: openscad [options] file.scad
```

**Allowed options:**

| Option | Description |
|---|---|
| `--export-format arg` | overrides format of exported scad file when using option '-o', arg can be any of its supported file extensions. For ascii stl export, specify 'asciistl', and for binary stl export, specify 'binstl'. Ascii export is the current stl default, but binary stl is planned as the future default so asciistl should be explicitly specified in scripts when needed. |
| `-o [ --o ] arg` | output specified file instead of running the GUI, the file extension specifies the type: stl, off, wrl, amf, 3mf, csg, dxf, svg, pdf, png, echo, ast, term, nef3, nefdbg (May be used multiple time for different exports). Use '-' for stdout |
| `-D [ --D ] arg` | var=val -pre-define variables |
| `-p [ --p ] arg` | customizer parameter file |
| `-P [ --P ] arg` | customizer parameter set |
| `--enable arg` | enable experimental features (specify 'all' for enabling all available features): roof \| input-driver-dbus \| lazy-union \| vertex-object-renderers \| vertex-object-renderers-indexing \| vertex-object-renderers-direct \| vertex-object-renderers-prealloc \| textmetrics |
| `-h [ --help ]` | print this help message and exit |
| `-v [ --version ]` | print the version |
| `--info` | print information about the build process |
| `--camera arg` | camera parameters when exporting png: =translate_x,y,z,rot_x,y,z,dist or =eye_x,y,z,center_x,y,z |
| `--autocenter` | adjust camera to look at object's center |
| `--viewall` | adjust camera to fit object |
| `--imgsize arg` | =width,height of exported png |
| `--render` | for full geometry evaluation when exporting png |
| `--preview arg` | [=throwntogether] -for ThrownTogether preview png |
| `--animate arg` | export N animated frames |
| `--view arg` | =view options: axes \| crosshairs \| edges \| scales \| wireframe |
| `--projection arg` | =(o)rtho or (p)erspective when exporting png |
| `--csglimit arg` | =n -stop rendering at n CSG elements when exporting png |
| `--summary arg` | enable additional render summary and statistics: all \| cache \| time \| camera \| geometry \| bounding-box \| area |
| `--summary-file arg` | output summary information in JSON format to the given file, using '-' outputs to stdout |
| `--colorscheme arg` | =colorscheme: \*Cornfield \| Metallic \| Sunset \| Starnight \| BeforeDawn \| Nature \| DeepOcean \| Solarized \| Tomorrow \| Tomorrow Night \| Monotone |
| `-d [ --d ] arg` | deps_file -generate a dependency file for make |
| `-m [ --m ] arg` | make_cmd -runs make_cmd file if file is missing |
| `-q [ --quiet ]` | quiet mode (don't print anything *except* errors) |
| `--hardwarnings` | Stop on the first warning |
| `--check-parameters arg` | =true/false, configure the parameter check for user modules and functions |
| `--check-parameter-ranges arg` | =true/false, configure the parameter range check for builtin modules |
| `--debug arg` | special debug info - specify 'all' or a set of source file names |

## Export options

When called with the -o option, OpenSCAD does not start the GUI, but executes the given file and exports to the output_file in a format depending on the extension (.stl / .off / .dxf, .csg).

Some versions use -s/-d/-o to determine the output file format instead; check with "openscad --help".

If the option -d is given in addition to an export command, all files accessed while building the mesh are written in the argument of -d in the syntax of a Makefile.

For at least 2015.03-2+, specifying the extension .echo causes openscad to produce a text file containing error messages and the output of all echo() calls in filename as they would appear in the console window visible in the GUI. Multiple output files are not supported, so using this option you cannot also obtain the model that would have normally been generated.

Note: When exporting to STL, the GUI defaults to binary STL (smaller, faster) and the CLI defaults to ASCII STL (larger, slower). Post-processing pipelines may prefer ASCII STL; they should explicitly say `--export-format asciistl` in preparation for the default eventually changing to binary STL.

## Camera and image output

For 2013.05+, the option to output a .png image was added. There are two types of cameras available for the generation of images.

The first camera type is a 'gimbal' camera that uses Euler angles, translation, and a camera distance, like OpenSCAD's GUI viewport display at the bottom of the OpenSCAD window.

The second camera type is a 'vector' camera, with an 'eye' camera location vector and a 'lookat' center vector.

`--imgsize x,y` chooses the .png dimensions and `--projection` chooses orthogonal or perspective, as in the GUI.

By default, cmdline .png output uses Preview mode (f5) with OpenCSG. For some situations it may be desirable to output the full render, with CGAL. This is done by adding `--render` as an option.

## Constants

In order to pre-define variables, use the -D option. It can be given repeatedly. Each occurrence of -D must be followed by an assignment. Unlike normal OpenSCAD assignments, these assignments don't define variables, but constants, which cannot be changed inside the program, and can thus be used to overwrite values defined in the program at export time.

If you want to assign the -D variable to another variable, the -D variable MUST be initialized in the main .scad program

```scad
param1=17;      // must be initialized
val=param1;     // param1 passed via -D on cmd-line
echo(val,param1); // outputs 17,17
```

without the first line, val would be undefined.

The right hand sides can be arbitrary OpenSCAD expressions, including mathematical operations and strings.

Be aware that your shell (bash, cmd, etc.) parses the arguments before passing them to openscad, therefore you need to properly quote or escape arguments with special characters like spaces or quotation marks. For example to assign a string production to a quality parameter one has to ensure the " characters OpenSCAD expects aren't stripped by the shell. In bash one could write:

```bash
openscad -o my_model_production.stl -D 'quality="production"' my_model.scad
```

or from the Windows prompt:

```cmd
openscad.com -o my_model_production.stl -D "quality=""production""" my_model.scad
```

or you may need to escape the inner quotes instead:

```bash
openscad -o my_model_production.stl -D "quality=\"production\"" my_model.scad
```

Note that this sort of double-escaping isn't necessary when executing OpenSCAD from another process that isn't using a shell, because each argument is passed separately. For example a Java application might start a process like so:

```java
pb = new ProcessBuilder("/usr/bin/openscad",
    "-o", "my_model_production.stl",
    "-D", "quality=\"production\"",
    "my_model.scad");
```

## Command to build required files

In a complex build process, some missing files required by an OpenSCAD file can be generated if they are defined in a Makefile. If OpenSCAD is given the option `-m make`, it starts make file the first time it tries to access a missing file.

## Processing all .scad files in a folder

Example to convert all the .scad in a folder into .stl:

In a folder with .scad files, make a .bat file with text:

```bat
FOR %%f in (*.scad) DO openscad -o "%%~nf.stl" "%%f"
```

If it closes without processing, check to set the PATH by adding openscad directory to:

Start - Settings - Control Panel - System - Advanced tab - Environment Variables - System Variables, select Path, then click Edit.

Add the openscad directory to the list

The -d and -m options only make sense together. (-m without -d would not consider modified dependencies when building exports, -d without -m would require the files to be already built for the first run that generates the dependencies.)

## Makefile example

Here is an example of a basic Makefile that creates an .stl file from an .scad file of the same name:

```makefile
# explicit wildcard expansion suppresses errors when no files are found
include $(wildcard *.deps)

%.stl: %.scad
	openscad -m make -o $@ -d $@.deps $<
```

When `make my_example.stl` is run for the first time, it finds no .deps files, and must depend on my_example.scad. Because my_example.stl is not yet preset, it gets created unconditionally. If OpenSCAD finds missing files, it calls make to build them, and it lists all used files in my_example.stl.deps.

When `make my_example.stl` is called subsequently, it finds and includes my_example.stl.deps and check if any of the files listed there, including my_example.scad, changed since my_example.stl was built, based on their time stamps. Only if that is the case, it builds my_example.stl again.

## Automatic targets

When building similar .stl files from a single .scad file, there is a way to automate that too:

```makefile
# match "module foobar() { // `make` me"
TARGETS=$(shell sed '/^module [a-z0-9_-]*().*make..\?me.*$$/!d;s/module //;s/().*/.stl/' base.scad)

all: ${TARGETS}

# auto-generated .scad files with .deps make make re-build always. keeping the
# scad files solves this problem. (explanations are welcome.)
.SECONDARY: $(shell echo "${TARGETS}" | sed 's/\.stl/.scad/g')

# explicit wildcard expansion suppresses errors when no files are found
include $(wildcard *.deps)

%.scad:
	echo -ne 'use <base.scad>\n$*();' > $@

%.stl: %.scad
	openscad -m make -o $@ -d $@.deps $<
```

All objects that are supposed to be exported automatically have to be defined in base.scad in an own module with their future file name (without the ".stl"), and have a comment like "// make me" in the line of the module definition. The "TARGETS=" line picks these out of the base file and creates the file names. These are built when `make all` (or `make`, for short) is called.

As the convention from the last example is to create the .stl files from .scad files of the same base name, for each of these files, an .scad file must be generated. This is done in the "%.scad:" paragraph; my_example.scad is a simple OpenSCAD file:

```scad
use <base.scad>
my_example();
```

The ".SECONDARY" line is there to keep make from deleting the generated .scad files. Its presence helps determine which files no longer need to be rebuilt; please post ideas about what exactly goes wrong there (or how to fix it better) on the talk page!

## Windows notes

On Windows, openscad.com should be called from the command line as a wrapper for openscad.exe. This is because Openscad uses the 'devenv' solution to the Command-Line/GUI output issue. Typing 'openscad' at the cmd.exe prompt calls the .com program wrapper by default.

## MacOS notes

On MacOS the binary is normally hidden inside the App folder. If OpenSCAD is installed in the global Applications folder, it can be called from command line like in the following example that just shows the OpenSCAD version:

```bash
macbook:/$ /Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD -v
OpenSCAD version 2013.06
```

Alternatively, you may create a symbolic link to the binary to make calls from the command line easier:

```bash
macbook:/$ sudo ln -sf /Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD /usr/local/bin/openscad
```

Now you can call openscad directly without having to type in the full path.

```bash
macbook:/$ openscad -v
OpenSCAD version 2015.03-3
```

On some versions of MacOS, you might get the following error when attempting to run openscad via that link:

> This application failed to start because it could not find or load the Qt platform plugin "cocoa".

> Reinstalling the application may fix this problem.

> Abort trap: 6

You can fix this by creating a wrapper script to invoke the executable directly:

```bash
sudo rm -f /usr/local/bin/openscad
echo '#!/bin/sh' > test
echo '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD "$@"' >> test
chmod +x test ; sudo mv test /usr/local/bin/openscad
```

---

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Using_OpenSCAD_in_a_command_line_environment&oldid=4598182"

---

# OpenSCAD User Manual/Using an external Editor with OpenSCAD

Many people prefer to use a certain editor. They are used to the feature set and know the keybindings. OpenSCADs editor is functional and simple but might lack features people know from other editors.

A relatively recent benefit is that many of the more powerful external editors can act as a client for an OpenSCAD language server, permitting IDE-style functionality such as inline error/warning displays, module/function documentation on hover, jump to module/function definition, find module/function references, code reformatting, etc. There are a handful of OpenSCAD language servers in various levels of development, currently the [openscad-lsp](https://github.com/Leathong/openscad-LSP) language server provides the most features.

## Why use an external editor

OpenSCAD is able to check for changes of files and automatically recompile if a file change occurs. To use this feature enable "Design->Automatic Reload and Preview"

## How to use an external editor

Once the feature is activated, just load the scad file within OpenSCAD as usual ("File->Open.."). After that, open the scad file in your favorite editor too. Edit and work on the scad file within the external editor. Whenever the file is saved to disk (from within the external editor), OpenSCAD recognizes the file change and automatically recompiles accordingly.

The internal editor can be hidden by minimizing the frame with the mouse or by selecting "Window->Hide editor".

## Support of external editors

In principle all editors can be used. Some even have extensions/modes to provide features for OpenSCAD.

- **Atom:** There is a [Language OpenSCAD package](https://atom.io/packages/language-openscad) for [Atom](https://atom.io) that provides highlighting and snippets.

- **Emacs:** OpenSCAD provides an [emacs mode](https://github.com/openscad/emacs-scad-mode) for OpenSCAD files. Use the link or install scad-mode via emacs package management (ELPA) with the [MELPA](https://melpa.org/#/scad-mode) repository.

- **Geany:** [cobra18t](http://www.thingiverse.com/cobra18t/overview) provides a [Geany syntax file](http://www.thingiverse.com/thing:263620) for OpenSCAD. See Instructions tab in Thingiverse to install it.

- **Gedit:** [Andy Turner](https://github.com/AndrewJamesTurner) provides a [Gedit syntax file](https://github.com/AndrewJamesTurner/openSCAD-lang-file) for OpenSCAD.

- **IntelliJ:** has an 'OpenSCAD Language Support' plugin.

- **Kate:** [nerd256](http://www.thingiverse.com/nerd256/overview) provides a [kate syntax file](http://www.thingiverse.com/thing:29505) for OpenSCAD. See Instructions tab in Thingiverse to install it. You could create also a kate External tool to open OpenSCAD with the current file with script `openscad %directory/%filename`

- **Neovim:** An example configuration including basic linting and formatting is available via [OpenSCAD in Neovim](https://n8henrie.com/2022/05/openscad-in-neovim/)

- **Notepad++:** [TheHeadlessSourceMan](http://www.thingiverse.com/TheHeadlessSourceMan/overview) provides a [Notepad++ syntax file](http://www.thingiverse.com/thing:280319) for OpenSCAD. See Instructions tab in Thingiverse to install it.

- **OpenSCADitor:** OpenSCAD-dedicated editor ([https://www.openscad.org/](https://www.openscad.org/))

- **Pulsar:** [Pulsar](https://pulsar-edit.dev/) has the [language-openscad package](https://web.pulsar-edit.dev/packages/language-openscad) to provide highlighting and snippets.

- **Sublime:** [Syntax highlighting and Customizer support](http://www.thingiverse.com/thing:67566)

- **Textmate:** [Syntax highlighting and Customizer support](http://www.thingiverse.com/thing:67566)

- **VIM:** vim.org provides a [VIM syntax file](http://www.vim.org/scripts/script.php?script_id=3556) for OpenSCAD.

- **Visual Studio Code** and its FOSS build, [VSCodium](https://vscodium.com), have multiple OpenSCAD extensions available, providing highlighting, autocomplete, go to definition, code formatting, preview and more. Type "OpenSCAD" into the View > Extensions panel search box to find and install.

---

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Using_an_external_Editor_with_OpenSCAD&oldid=4613429"


---

# OpenSCAD User Manual/Building OpenSCAD from Sources

Most users prefer to download the pre-compiled binary installation packages from the main [http://www.openscad.org](http://www.openscad.org) website.

However, you can compile the OpenSCAD source yourself if you so desire. It allows you to experiment with new features and bug fixes in the development versions. It also exposes you to certain accidental breaks and bugs during the development process. It is highly recommended you join the openscad developers mailing list if you are experimenting with the latest source code.

This page provides general information. You can find specific step-by-step instructions on the following pages:

- OpenSCAD User Manual/Building on Linux/UNIX
- OpenSCAD User Manual/Cross-compiling for Windows on Linux or Mac OS X
- OpenSCAD User Manual/Building on Windows
- Building on Windows (New)
- OpenSCAD User Manual/Building on Mac OS X
- OpenSCAD User Manual/Submitting patches

OpenSCAD, as of 2011, relies heavily on two other projects: the OpenCSG library and the CGAL geometry library. OpenCSG uses special tricks of OpenGL graphics cards to quickly produce 2-d 'previews' of Computational Solid Geometry operations. This is the normal 'F5' mode. CGAL on the other hand is a Geometry library that actually calculates intersections & unions of objects, allowing for .stl export to 3d printers. This is the 'F6' mode.

In theory, though, the backend libraries could be replaced. OpenSCAD is a text-based CAD program. It doesn't matter what 'backend' is used for it's geometry as long as it works properly and provides useful functions. Discussions on the mailing list have mentioned the possibility of the OpenCASCADE library instead of CGAL, for example.

## Structure of OpenSCAD

### OpenCSG

[OpenCSG](http://www.opencsg.org) is based largely around special algorithms that can 'fake' the presentation of Computational Solid Geometry operations (subtraction, intersection, union) on a 2d screen. The two main algorithms it uses are SCS and Goldfeather, selectable in OpenSCAD from the 'preferences' menu. The algorithms work by breaking down CSG operations into parts, and then rendering the parts into an OpenGL graphics buffer using special features such as an off-screen OpenGL Framebuffer Object (or Pbuffers), as well as making extensive use of the OpenGL Stencil Buffer and Depth Buffer.

OpenCSG also requires that the objects be 'normalized'. For example, if your code says to start with a cube, subtract a sphere, add a diamond, add a cylinder, add two more spheres, and subtract a donut, this is not 'normalized'. Normalization forms the primitive objects into a 'tree' where each 'leaf' consists of a 'positive' and 'negative' object. OpenSCAD does this normalization itself, as can be seen in the log window during OpenCSG previews. The Normalized CSG tree is then passed to OpenCSG for rendering. Occasionally the normalization process "blows up" and freezes the machine, making CGAL rendering the only way to view an object. The number of objects during normalization is limited and can be changed in OpenSCAD preferences.

OpenCSG has it's own example source code that comes with the program. It can help you to learn about the various OpenCSG rendering options.

**Links:**

- [OpenCSG main website](http://www.opencsg.org)
- [Freenix 2005 slideshow](http://www.opencsg.org/data/csg_freenix2005_talk.pdf) on OpenCSG, Goldfeather, and Normalization
- [Freenix 2005 paper](http://www.opencsg.org/data/csg_freenix2005_paper.pdf), more detail on Goldfeather, Normalization, etc.

### CGAL

CGAL is the Computational Geometry Algorithm Library. It contains a large collection of Geometry algorithms and methods by which objects can be represented. It calculates the actual 'point sets' of 3d objects, which enables the output of 3d formats like STL.

OpenSCAD uses two main features of CGAL - the Nef Polyhedra and the 'ordinary' Polyhedra. It also uses various other functions like Triangulation &c. But the main data structures are the Nef and the 'ordinary' Polyhedra.

#### Nef Polyhedra

According to wikipedia's Nef Polyhedron article, Nef Polyhedrons are named after Walter Nef, who wrote a book on Polyhedrons named "Beiträge zur Theorie der Polyeder" published in 1978 by Herbert Lang, in Bern, Switzerland. A rough explanation of the theory goes like this: imagine you can create a 'plane' that divides the universe in half. Now, imagine you can 'mark' one side to be the 'inside' and the other side to be the 'outside'. Now imagine you take several of these planes, and arrange them, for example, as if they were walls of a room, and a ceiling and a floor. Now lets just imagine the 'inside' of all of these planes - and now imagine that you do an 'intersection' operation on them - like a venn diagram or any other boolean operation on sets. This 'intersection' forms a cuboid - from the outside it just looks like a box. This box is the Nef Polyhedron. In other terms, you have created a polyhedron by doing boolean operations on "half spaces" - halves of the universe.

Why would you go to all this trouble? Why not just use plain old 'points in space' and triangle faces and be done with it? Well, Nef Polyhedrons have certain properties that make boolean operations on them work better than boolean operations between meshes—in theory.

CGAL's Nef Polyhedron code calculates the resulting 3 dimensional points of the new shapes generated when you perform CSG operations. Let's take example 4 from OpenSCAD's example programs. It is a cube with a sphere subtracted from it. The actual coordinates of the polygons that make up that 'cage' shape are calculated by CGAL by calculating the intersections and unions of the 'half spaces' involved. Then it is converted to an 'ordinary polyhedron'. This can then be transformed into .stl (stereolithography) files for output to a 3d-printing system.

#### Ordinary Polyhedra

CGAL's Nef Polyhedron is not the only type of Polyhedron representation inside of CGAL. There is also the more basic "CGAL Polyhedron_3", which here is called 'ordinary' Polyhedra. In fact, many of OpenSCAD's routines convert a CGAL Nef Polyhedron into an 'ordinary' CGAL Polyhedron_3. The trick here is that 'ordinary' Polyhedron_3's have limits. Namely this: "the polyhedral surface is always an orientable and oriented 2-manifold with border edges". That means it deals only with "water tight" surfaces that don't have complicated issues like self-intersection, isolated lines and points, etc. A more exact explanation can be found here: http://www.carliner-remes.com/jacob/math/project/math.htm

The conversion between Nef Polyhedra and 'plain' Polyhedron_3 can sometimes result in problems when using OpenSCAD.

#### Issues

In theory CGAL is seamless and consistent. In actuality, there are some documentation flaws, bugs, etc. OpenSCAD tries to wrap calls to CGAL with exception-catchers so the program doesn't crash every time the user tries to compile something.

Another interesting note is comparing the 2d and 3d polyhedra and nef polyhedra functions. There is no way to transform() a 2d nef polyhedron, for example, so OpenSCAD implemented it's own. There is no easy way to convert a Nef polyhedron from 2d to 3d. The method for 'iterating through' the 2d data structure is also entirely different from the way you iterate through the 3d data structure - one uses an 'explorer' while another provides a bunch of circulators and iterators.

CGAL is also slow to compile - as a library that is almost entirely headers, there is no good way 'around' this other than to get a faster machine with more RAM, and possibly to use the clang compiler instead of GCC. Paralell building ( make -j ) can help but that doesn't speed up the compile of a single file you are working on if it uses a feature like CGAL Minkowski sums.

### CGAL and GMPQ

CGAL allows a user to pick a 'kernel' - the type of numbers to be used in the underlying data structures. Many 3d rendering engines just use floating-point numbers - but this can be a problem when doing geometry because of roundoff errors. CGAL offers other kernels and number types, for example the GMPQ number type, from the GNU GMP project. This is basically the set of Rational Numbers.

Rational Numbers (the ratio of two integers) are an advantage in Geometry because you can do a lot of things to them without any rounding error - including scaling. For example, take the number 1/3. You cannot represent that exactly in IEEE floating point on a PC. It comes out to 0.3333... going on to infinity. The same goes for numbers like 0.6 - there is actually no binary representation of the decimal number 0.6 in a finite number of binary digits.

The binary number system on a finite-bit machine is not 'closed' under division. You can divide one finite-digit binary floating point number by another and get a number thats not, itself, a finite-digit binary floating point number. Like, 6, divided by 10, yielding 0.6. In fact this is not just a problem of binary numbers, it's a problem of any number system that uses a decimal point and has a finite number of digits - from the Ten-based system (decimals) to Hexadecimal to Binary to anything. But with Rationals this doesn't happen. You can divide any rational number by any other rational and you wind up with another Rational - and it is not infinite and there is no rounding involved. So 'scaling' down a 3d object made of Rational Points results in 0 rounding error. 'scaling' down a 3d object of floating point numbers frequently result in rounding error.

Another nice feature of rationals is that if you have two lines whose end-points (or rise/run, or line equation) are rational numbers, their intersection point is also a rational number with no rounding error. Finite Floating Point numbers cannot guarantee that (because of the division involved in solving the line equations). Note that this is helpful for a program like CGAL that is dealing with lots of intersections between planes. Imagine doing an 'interesection' between two faceted spheres offset by their radius, for example.

The downside is that Rationals are slow. Most of the optimization made in the hardware of modern computer CPUs is based around the idea of dealing with ordinary floating-point or integer numbers, not with ratios of integers - integers that can be larger than the size of 'long int' on the machine (also called Big Ints).

When doing debugging, if you are inside the code and you do something like 'std::cout << vertex->point().x()" you get a ratio of two integers, not a floating point. For floating conversion, you have to use CGAL::to_double( vertex->point().x() ); You may notice, sometimes, that your 'double' conversion, with its chopping off and rounding, might show that two points are equal, when printing the underlying GMPQ shows that, in fact, the same two points have different coordinates entirely.

Lastly, within OpenSCAD, it must be noted that it's default number type is typically C++ 'double' (floating point). Thus, even though you may have 'perfect' CGAL objects represented with rationals, OpenSCAD itself uses a lot of floating point, and translates the floating point back-and-forth to CGAL GMPQ during compilation (another area for slowdown).

**Links:**

- [CGAL's main website](https://www.cgal.org)
- [Number representation in CGAL](https://www.cgal.org/Manual/latest/doc_html/cgal_manual/NumberTypeSupport/Chapter_main.html)
- [CGAL 3d Boolean operations on Nef Polyhedra](https://www.cgal.org/Manual/latest/doc_html/cgal_manual/Nef_3/Chapter_main.html) (Notice any familiar colors?)
- [ordinary CGAL Polyhedron 3](https://www.cgal.org/Manual/latest/doc_html/cgal_manual/Polyhedron_ref/Class_Polyhedron_3.html)
- [Nef polyhedron](https://en.wikipedia.org/wiki/Nef_polygon), wikipedia

### Throwntogether

The "Throwntogether" renderer is a "fall back" quick-preview renderer that OpenSCAD can use if OpenCSG is not available. It should work on even the most minimal of OpenGL systems. It's main drawback is that it renders negative spaces as big, opaque, green blocks instead of as 'cut outs' of the positive spaces. This can hide a lot of the internal detail of a shape and make use of OpenSCAD more difficult. The 'intersection' command, for example, does not do anything - it simply displays the full intersection shapes as if they were a union. However, by hitting 'F6' the user can still compile the object into CGAL and see the shape as it is intended.

Under what circumstances does the program fall back to Throwntogether, instead of using OpenCSG preview? In cases where the OpenGL machine does not support Stencil Buffers, and cannot draw Offscreen images with "Framebuffer Objects" (FBOs). If the user finds that OpenCSG support is buggy on their system, they can also manually switch to 'throwntogether' mode through the menus.

### Ifdefs

The design of the code is so that, in theory, CGAL and/or OpenCSG can be disabled or enabled. In practice this doesn't always work and tweaking is needed. But if some day the underlying engines were to be replaced, this feature of the code would greatly aid such a transition.

### Value

The Value class is OpenSCAD's way of representing numbers, strings, boolean variables, vectors, &c. OpenSCAD uses this to bridge-the-gap between the .scad source code and the guts of it's various engines. value.h and value.cc use the boost 'variant' feature (sort of like C unions, but nicer).

## Source Code Notes

### Node

The most important pieces derive from the AbstractNode class. Various conventions and patterns are the same between different nodes, so when implementing new features or fixing bugs, it can be helpful to simply look at the way things are done by comparing nodes. For example transformnode.h and transform.cc show the basic setup of how something like 'scale()' goes from source code (in a 'context') into a member variable of the transformnode (node.matrix), which is then used by CGALEvaluator.cc to actually do a 'transform' on the 3d object data. This can be compared with colornode, lineartextrudenode, etc.

### Polyset

PolySet is a sort of 'inbetween' glue-class that represents 3d objects in various stages of processing. All primitives are first created as a PolySet and then transformed later, if necessary, into CGAL forms. OpenSCAD currently converts all import() into a PolySet, before converting to CGAL Nef polyhedra, or CGAL 'ordinary' polyhedra.

### DXF stuff

As of early 2013, OpenSCAD's 2d subsystem relies heavily on DXF format, an old format used in Autocad and created by Autodesk in the 1980s. DXFData is sort of the equivalent of PolySet for 2d objects - glue between various other 2d representations.

### CGAL Nef Polyhedron

This class 'encapsulates' both 2d and 3d Nef polyhedrons. It contains useful functions like the boolean operators, union, intersection, and even Minkowski sum. It is incredibly slow to compile, mostly due to the CGAL minkowski header code being large, so it has been broken into separate .cc files. You may also note that pointers are generally avoided when dealing with Nef polyhedra - instead boost::shared_ptr is used.

### CGAL ordinary polyhedron

You may notice there is no class for 'ordinary' CGAL Polyhedron. That's correct. There isn't. it's always just used 'as is', typically as an intermediate form between other formats. As noted, the conversion to/from 'ordinary' can cause issues for 'non 2-manifold' objects. CGAL's Polyhedron also is used for file export (see export.cc).

### GUI vs tests

As of early 2013 OpenSCAD used two separate build systems. one for the GUI binary, and another for regression testing. The first is based on Qmake and the second on Cmake. Adding features may require someone to work with both of these systems. See doc/testing.txt for more info on building and running the regression tests.

### QT

OpenSCAD's GUI uses the QT toolkit. However, for all non-gui code, the developers avoid QT and use alternatives like boost::filesystem. This helps with certain things like modularity and portability. As of mid-2013, it was possible to build the test suites entirely without QT.

## Library Notes

### Other libraries & library versions

OpenSCAD also depends on Boost, the Eigen math library, and the GLEW OpenGL extension helper library. In order to actually build OpenSCAD, and compile and run the self-diagnostic tests, OpenSCAD also needs tools like 'git', 'cmake', and ImageMagick. Version numbers can be important. They are listed in a readme file in the root of the OpenSCAD source code. Using libraries that are too old can result in an OpenSCAD that exhibits bizarre behavior or crashes.

## Submitting Patches

See OpenSCAD_User_Manual/Submitting_patches

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Building_OpenSCAD_from_Sources&oldid=4531855"*

---

# OpenSCAD User Manual/Input Devices

[Note: Requires version 2019.05]

The input driver enables the use of devices such as a gamepad, or a 3D mouse, in OpenSCAD.

Currently, the following drivers are in development:

- **HIDAPI** - Used on MacOS and Windows - needs the USB IDs / it works on Linux too, but needs additional privileges, so it's not ideal for the user
- **Joystick driver** - uses the Linux joystick device (currently fixed /dev/input/js0)
- **SpaceNav driver** - via the spacenavd daemon
- **DBus driver** - Linux only. Not for actual devices, but for remote control
- **QGamepad** - Used for cross-platform joystick support - This seems to require some additional configuration on Qt level currently. Needs some more work to make it easy to use

The default axes mapping is for 3D mice.

## Introduction

The input driver is currently part of the current development snapshots and nightly builds.

These builds can be found here: http://www.openscad.org/downloads.html#snapshots

## How to try it out

### Joystick and gamepads

On Linux, you have the option to use the native joystick driver or the cross-platform QGamepad driver. The native Joystick driver is recommended.

On other platforms, OpenSCAD is currently limited to QGamepad.

*Example Input Mapping for an Xbox 360 controller with Linux, using the native Joystick Driver.*

*Notice the increased dead zone due to worn out joysticks.*

*Axis 5 and 2 are triggers, they have a trim of 1 applied as their ideal value is typical -1.0 and are mapped to zoom.*

#### Joystick driver

##### Linux

The Joystick input driver uses the device /dev/input/js0.

On Ubuntu, you need to have the joystick package installed to enable joystick support.

#### QGamepad driver

*Almost any controller that your Linux computer recognizes should work*

*QGamepad works well with Xbox 360 controllers*

QGamepad can used with Windows and Linux.

The QGamepad driver makes assumptions about the gamepad that might not be true. Using an Xbox 360 or compatible controller works best.

Other controllers might be limited by QGamepad. (e.g. unable to map buttons and/or axes)

QGamepad treats the D-Pad of the Xbox 360 Controller as buttons.

### 3D mouse

#### Linux

On Linux, the easiest way to use the Space Mouse Wireless is, to go through the Joystick driver that is normally enabled on most systems.

##### Spacenav

Spacenav is also supported. http://spacenav.sourceforge.net/ https://wiki.archlinux.org/index.php/3D_Mouse#Open_Source_Drivers

```
sudo apt-get spacenavd
```

On Debian:

```
sudo apt install libspnav-dev
```

(requires a restart)

##### HIDAPI

In order to use the HIDAPI with Linux, OpenSCAD needs to be able to access the system with root privileges.

This is not recommended, but it may be helpful for temporary troubleshooting.

The recommended approach is to figure out which vendor ID and product ID your device has and then add a udev rule that allows non-privileged users to use the device.

To figure out your product's ID, use the lsusb command. This is how a relevant line of output from lsusb might look:

```
$ lsusb
[...]
Bus 002 Device 006: ID 046d:c627 Logitech, Inc. 3Dconnexion Space Explorer 3D Mouse
```

Both the vendor and product IDs are contained in the string ID 046d:c627. The vendor ID is the first part: 046d. the device ID is the second part: c627.

[This Stack Overflow answer](https://stackoverflow.com/questions/3738173/why-does-pyusb-libusb-require-root-sudo-permissions-on-linux/32022908#32022908) has an example of a udev rule. You can also refer to the [Arch Linux Wiki entry for 3D mice](https://wiki.archlinux.org/title/3D_Mouse) and [creating udev rules for regular users](https://wiki.archlinux.org/title/Udev#Allowing_regular_users_to_use_devices).

#### Windows

OpenSCAD interacts directly with the 3D mouse using the HIDAPI.

Therefore, the device manufacturer's driver is not required.

##### Disabling the device manufacturer's driver

If the device manufacturer's driver is installed, it has to be stopped.

Here are two ways to stop the driver:

- In your Start menu, you should have a folder called "3Dconnexion". Open the "Stop Driver" item from that folder.
- You can also try to run the following command: `"C:\Program Files\3Dconnexion\3DxWare\3DxWinCore64\3DxService.exe" -shutdown`

##### Using a wireless receiver

The wireless version (3DX-700066) of the 3D mouse has a receiver that registers multiple HID devices - you might need to disable some of them ('HID-compliant vendor-defined device') in the Device Manager to get it to pick up the correct one.

If your 3D mouse works when it is connected via the cable, but not via the wireless receiver (and OpenSCAD detects a 3D mouse, but doesn't detect any input), this is potentially the problem you're having.

#### macOS

As with other platforms, you have to disable the native 3DConnexion drivers completely, as OpenSCAD does not use them.

To enable the built-in driver for the SpaceMouse, go to Preferences → Axes, turn on the HIDAPI setting, and restart OpenSCAD.

The following devices have been tested and are known to work with OpenSCAD on macOS Mojave:

- SpaceMouse Compact (USB)
- SpaceMouse Wireless

### DBus

The D-Bus driver can be used for remote controlling OpenSCAD. This is mainly intended for programmers. For example, it can be used to write a custom input driver.

#### Debug and testing

For debugging and testing, D-Feet can be used. OpenSCAD can be found on the Session Bus under org.openscad.OpenSCAD.

qdbus is NOT recommended as it has issues with some of the more complex data structures.

#### Example

An example for QT/C++ can be found on [this page](https://github.com/MichaelPFrey/openscad-dbus-reference).

#### Camera System

Note that OpenSCAD's camera behavior and system does not behave in a standard way. Via DBus, you are directly interacting with OpenSCAD's camera. Note: the camera system and its interface may be refactored at some point in the future.

#### Actions

Please note that the actions exposed via DBus are mostly the ones from OpenSCAD's menu bar. Keep in mind that the menu bar might change at some point and that compatibility with the DBus driver is not a priority for development.

## FAQ

### Which button is which?

Open preferences, go to the button tab, then press the button you want to assign. The text next to the relevant ComboBox appears red and bold.

### View is drifting

If your view is drifting, please re-calibrate the neutral position and deadzone of your input device. This can be done within OpenSCAD or with the tools of the operating system.

### Where are my settings stored?

See [OpenSCAD's Github wiki](https://github.com/openscad/openscad/wiki/Path-locations).

### Y+Viewport-rel-translation (VRT) Channel is not responding to input

You are in orthogonal view. Please change it to perspective to see what it does.

Or look in the bottom left corner, where translate = changes. This is not a bug, this is a very specific feature. When you map zoom to one axis and Y+Viewport-rel-translation to an other while in perspective view, you should get the vertigo effect.

Most users use zoom as it works in both orthogonal and perspective.

If you're wondering why you can map two axis to zoom: Many game controllers have two analog shoulder triggers.

This has little to no real world use, but is about giving the user as much control as possible.

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Input_Devices&oldid=4530161"*

---

# OpenSCAD User Manual/Paths

OpenSCAD looks for and saves resources to various paths. This is an overview.

This page describes the patterns used for all systems and all platforms. For the paths used on your particular installation, look at "Library info" on the "Help" menu.

## Env variables

- `HOME`
- `XDG_CONFIG_HOME`
- `OPENSCAD_FONT_PATH`
- `OPENSCADPATH`

## Per platform roots

**ResourcesPath**

- UNIX-like:
- Mac OS X: `OpenSCAD.app/Contents/Resources`
- Windows: installation directory, typical default `C:\Program Files\OpenSCAD`

**DocumentsPath**

- UNIX-like: `$HOME/.local/share`
- Mac OS X: `[NSDocumentDirectory]`, typically `$HOME/Documents`
- Windows: `[FOLDERID_Documents]\OpenSCAD`, often `C:\Users\username\Documents\OpenSCAD`

**UserConfigPath**

- UNIX-like: `$XDG_CONFIG_HOME/OpenSCAD` or `$HOME/.config/OpenSCAD`
- Mac: `[NSApplicationSupportDirectory]`, typically `$HOME/Library/Application Support/OpenSCAD`
- Windows: `[FOLDERID_LocalAppData]\OpenSCAD`, typically `C:\Users\username\AppData\Local\OpenSCAD`

Note: the UserConfigPath directory is not created by default; if desired, the user must create it.

Windows note: FOLDERID_Documents and FOLDERID_LocalAppData were formerly known as CSIDL_PERSONAL and CSIDL_LOCAL_APPDATA.

## Read-only Resources

- libraries: `[ResourcesPath]/libraries`
- fonts: `[ResourcesPath]/fonts`
- render color schemes: `[ResourcesPath]/color-schemes/render`
- editor color schemes: `[ResourcesPath]/color-schemes/editor`
- templates: `[ResourcesPath]/templates`

## User Resources

- libraries: `$OPENSCADPATH`, `[DocumentsPath]/OpenSCAD/libraries`
- fonts
  - `$HOME/.fonts`
  - `$HOME/.local/share/fonts`
- render color schemes: `[UserConfigPath]/color-schemes/render`
- editor color schemes: `[UserConfigPath]/color-schemes/editor`
- templates: `[UserConfigPath]/templates`

## Misc Resources

- GUI preferences (Uses QSettings):
  - UNIX-like: `$HOME/.config/OpenSCAD.conf`
  - Windows: Registry: `HKEY_CURRENT_USER\SOFTWARE\OpenSCAD\OpenSCAD`
  - Mac OS X: `$HOME/Library/Preferences/org.openscad.OpenSCAD.plist`
- backups: `[DocumentsPath]/OpenSCAD/backups`

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Paths&oldid=4567642"*


---

# OpenSCAD User Manual/Tips and Tricks

## A note on licensing

All code snippets shown on this page are intended to be used freely without any attribution and for any purpose; consider any code contribution here to be placed under Public Domain or CC0 license. This is not meant to change the normal license of the page as a whole and/or the manual itself.

## Data

### Map values from a list

```
// The function that maps input values x to output values, the
// example uses floor() to convert floating point to integer
// values.
function map(x) = floor(x);

input = [58.9339, 22.9263, 19.2073, 17.8002, 40.4922, 19.7331, 38.9541, 28.9327, 18.2059, 75.5965];

// Use a list comprehension expression to call the map() function
// for every value of the input list and put the result of the
// function in the output list.
output = [ for (x = input) map(x) ];

echo(output);
// ECHO: [58, 22, 19, 17, 40, 19, 38, 28, 18, 75]
```

### Filter values in a list

```
// The function that define if the input value x should be
// included in the filtered list, the example selects
// all even values that are greater than 6.
function condition(x) = (x >= 6) && (x % 2 == 0);

input = [3, 3.3, 4, 4.1, 4.8, 5, 6, 6.3, 7, 8];

// Use a list comprehension expression to call the condition()
// function for every value of the input list and put the value
// in the output list if the function returns true.
output = [ for (x = input) if (condition(x)) x ];

echo(output);
// ECHO: [6, 8]
```

### Add all values in a list

```
// Create a simple recursive function that adds the values of a list of floats;
// the simple tail recursive structure makes it possible to
// internally handle the calculation as loop, preventing a
// stack overflow.
function add(v, i = 0, r = 0) = i < len(v) ? add(v, i + 1, r + v[i]) : r;

input = [2, 3, 5, 8, 10, 12];
output = add(input);

echo(output);
// ECHO: 40

//------------------ add2 -----------------------
// An even simpler non recursive code version of add explores the
// the matrix product operator
function add2(v) = [for(p=v) 1]*v;

echo(add2(input));
// ECHO: 40

// add2 works also with lists of vectors
input2 = [ [2, 3] , [5, 8] , [10, 12] ];
echo(add2(input2));
// ECHO: [17, 23]

echo(add(input2));
// ECHO: undef // Why?

//----------------- add3 --------------------------
// With a little more code, the function add may be used also
// to add any homogeneous list structure of floats
function add3(v, i = 0, r) =
    i < len(v) ?
        i == 0 ?
            add3(v, 1, v[0]) :
            add3(v, i + 1, r + v[i]) :
        r;

input3 = [ [[1], 1] , [[1], 2] , [[1], 3] ];
input4 = [ 10, [[1], 1] , [[1], 2] , [[1], 3] ];

echo(add3(input3));
// ECHO: [[3], 6]

echo(add2(input3));
// ECHO: undef // input3 is not a list of vectors
```

> **Note:** Requires version 2019.05

```
echo(add3(input4));
// ECHO: undef // input4 is not a homogeneous list
```

### Cumulative sum

```
//create a cumulative-sum function using a c-style generator
values = [1,2,65,1,4];

cumsum = [ for (a=0, b=values[0]; a < len(values); a= a+1, b=b+values[a]) b];

// Does not cause a warning "WARNING: undefined operation (number + undefined) in file ..."
cumsum2 = [ for (a=0, b=values[0]; a < len(values); a= a+1, b=b+(values[a]==undef?0:values[a])) b];

echo(cumsum);
// ECHO: [1, 3, 68, 69, 73]

echo(cumsum2);
// ECHO: [1, 3, 68, 69, 73]
```

### Count values in a list matching a condition

```
// The function that define if the input value x should be
// included in the filtered list, the example selects
// all even values that are greater than 6.
function condition(x) = (x >= 6) && (x % 2 == 0);

input = [3, 3.3, 4, 4.1, 4.8, 5, 6, 6.3, 7, 8];

// Use a list comprehension expression to call the condition()
// function for every value of the input list and put the value
// in the output list if the function returns true.
// Finally the count is determined simply by using len() on the
// filtered list.
output = len([ for (x = input) if (condition(x)) x ]);

echo(output);
// ECHO: 2
```

### Find the index of the maximum value in a list

```
// Create a function that find the index of the maximum value
// found in the input list of floats
function index_max(l) = search(max(l), l)[0];

input = [ 6.3, 4, 4.1, 8, 7, 3, 3.3, 4.8, 5, 6];

echo(index_max(input));
// Check it
echo(input[index_max(input)] == max(input));
// ECHO: 3
// ECHO: true
```

### Caring about undef

Most illegal operations in OpenSCAD return undef. Some return nan. However, the program keeps running and undef values may cause unpredictable future behaviour if no precaution is taken. When a function argument is missing in a function call, an undef value is assigned to it in evaluating the function expression. To avoid this, a default value may be assigned to optional function arguments.

```
// add 'a' to each element of list 'L'
function incrementBy(L, a) = [ for(x=L) x+a ];

//add 'a' to each element of list 'L'; 'a' default is 1 when missing
function incrementByWithDefault(L, a=1) = [ for(x=L) x+a ];

echo(incrementBy= incrementBy([1,2,3],2));
echo(incrementByWithDefault= incrementByWithDefault([1,2,3],2));
echo(incrementBy= incrementBy([1,2,3]));
echo(incrementByWithDefault= incrementByWithDefault([1,2,3]));
// ECHO: incrementBy= [3, 4, 5]
// ECHO: incrementByWithDefault= [3, 4, 5]
// ECHO: incrementBy= [undef, undef, undef]
// ECHO: incrementByWithDefault= [2, 3, 4]
```

Sometimes the default value depends on other parameters of the call and cannot be set as before; a conditional expression solve this:

```
// find the sublist of 'list' with indices from 'from' to 'to'
function sublist(list, from=0, to) =
    let( end = (to==undef ? len(list)-1 : to) )
    [ for(i=[from:end]) list[i] ];

echo(s0= sublist(["a", "b", "c", "d"]) );        // from = 0, end = 3
echo(s1= sublist(["a", "b", "c", "d"], 1, 2) );   // from = 1, end = 2
echo(s2= sublist(["a", "b", "c", "d"], 1));        // from = 1, end = 3
echo(s3= sublist(["a", "b", "c", "d"], to=2) );    // from = 0, end = 2
// ECHO: s0 = ["a", "b", "c", "d"]
// ECHO: s1 = ["b", "c"]
// ECHO: s2 = ["b", "c", "d"]
// ECHO: s3 = ["a", "b", "c"]
```

The function sublist() returns undesirable values when from > to and generates a warning (try it!). A simple solution would be to return the empty list [] in this case:

```
// returns an empty list when 'from > to'
function sublist2(list, from=0, to) =
    from<=to ?
        let( end = (to==undef ? len(list)-1 : to) )
        [ for(i=[from:end]) list[i] ] :
        [];

echo(s1= sublist2(["a", "b", "c", "d"], 3, 1));
echo(s2= sublist2(["a", "b", "c", "d"], 1));
echo(s3= sublist2(["a", "b", "c", "d"], to=2));
// ECHO: s1 = []
// ECHO: s2 = []
// ECHO: s3 = ["a", "b", "c"]
```

The output s2 above is the empty list because to==undef and the comparison of from and to evaluates as false: the default value of to has been lost. To overcome this it is enough to invert the test:

```
function sublist3(list, from=0, to) =
    from>to ?
        [] :
        let( end = to==undef ? len(list)-1 : to )
        [ for(i=[from:end]) list[i] ] ;

echo(s1=sublist3(["a", "b", "c", "d"], 3, 1));
echo(s2=sublist3(["a", "b", "c", "d"], 1));
echo(s3=sublist3(["a", "b", "c", "d"], to=2));
// ECHO: s1 = []
// ECHO: s2 = ["b", "c", "d"]
// ECHO: s3 = ["a", "b", "c"]
```

Now, when to is undefined, the first test evaluates as false and the let() is executed. With careful choices of tests, we can deal with undef values.

## Geometry

### Stack cylinders on top of each other

```
// Define the sizes for the cylinders, first value is the
// radius, the second is the height.
// All cylinders are to be stacked above each other (with
// an additional spacing of 1 unit).
sizes = [ [ 26, 3 ], [ 20, 5 ], [ 11, 8 ], [ 5, 10 ], [ 2, 13 ] ];

// One option to solve this is by using a recursive module
// that creates a new translated coordinate system before
// going into the next level.
module translated_cylinder(size_vector, idx = 0) {
    if (idx < len(size_vector)) {
        radius = size_vector[idx][0];
        height = size_vector[idx][1];
        // Create the cylinder for the current level.
        cylinder(r = radius, h = height + 0.01);
        // Recursive call generating the next cylinders
        // translated in Z direction based on the height
        // of the current cylinder
        translate([0, 0, height - 0.01]) {
            translated_cylinder(size_vector, idx + 1);
        }
    }
}

// Call the module to create the stacked cylinders.
translated_cylinder(sizes);
```

![OpenSCAD - Stacked Cylinders](OpenSCAD - Stacked Cylinders)

### Minimum rotation problem

In 2D, except in very special cases, there are only two rotations that make a vector to align to another one. In 3D, there are infinitely many. Only one, however, has the minimum rotation angle. The following function builds the matrix for that minimum rotation. The code is a simplification of a function found in the Oskar Linde's sweep.scad.

```
// Find the unitary vector with direction v. Fails if v=[0,0,0].
function unit(v) = norm(v)>0 ? v/norm(v) : undef;

// Find the transpose of a rectangular matrix
function transpose(m) = // m is any rectangular matrix of objects
    [ for(j=[0:len(m[0])-1]) [ for(i=[0:len(m)-1]) m[i][j] ] ];

// The identity matrix with dimension n
function identity(n) = [for(i=[0:n-1]) [for(j=[0:n-1]) i==j ? 1 : 0] ];

// computes the rotation with minimum angle that brings a to b
// the code fails if a and b are opposed to each other
function rotate_from_to(a,b) =
    let( axis = unit(cross(a,b)) )
    axis*axis >= 0.99 ?
        transpose([unit(b), axis, cross(axis, unit(b))]) *
            [unit(a), axis, cross(axis, unit(a))] :
        identity(3);
```

### Drawing "lines" in OpenSCAD

```
// An application of the minimum rotation
// Given two points p0 and p1, draw a thin cylinder with its
// bases at p0 and p1
module line(p0, p1, diameter=1) {
    v = p1-p0;
    translate(p0)
        // rotate the cylinder so its z axis is brought to direction v
        multmatrix(rotate_from_to([0,0,1],v))
            cylinder(d=diameter, h=norm(v), $fn=4);
}

// Generate the polygonal points for the knot path
knot = [ for(i=[0:2:360])
    [ (19*cos(3*i) + 40)*cos(2*i),
      (19*cos(3*i) + 40)*sin(2*i),
       19*sin(3*i) ] ];

// Draw the polygonal a segment at a time
for(i=[1:len(knot)-1])
    line(knot[i-1], knot[i], diameter=5);

// Line drawings with this function is usually excruciatingly lengthy to render
// Use it just in preview mode to debug geometry
```

![OpenSCAD - Knot](OpenSCAD - Knot)

Another approach to the module line() is found in Rotation rule help.

### hull sequence or chain

Using loops, complex models can be composed by iteratively producing hull segments, even with a small number of parameters. The body of the loop in the following example is evaluated repeatedly, using values for 'i', beginning at i=1, incrementing by 1, until evaluating i=18 and terminating before evaluating at i=19. This produces the following 2-dimensional array for values of 'i' and 'j': [[1,2], [2,3], [3,4], ..., [16,17], [17,18], [18, 19]]

```
for (i=[1:18]){
    j=i+1;
    hull(){
        translate([0,0,i])
            cylinder(.1,d1=10*sin(i*9),d2=0);
        translate([0,0,j])
            cylinder(.1,d1=10*sin(j*9),d2=0);
    }
}
```

### Fit text into a given area

There is currently no way to query the size of the geometry generated by text(). Depending on the model it might be possible to calculate a rough estimate of the text size and fit the text into the known area. This works using resize() with the assumption the length is the dominating value.

```
// Generate 2 random values between 10 and 30
r = rands(10, 30, 2);

// Calculate width and length from random values
width = r[1];
length = 3 * r[0];

difference() {
    // Create border
    linear_extrude(2, center = true)
        square([length + 4, width + 4], center = true);
    // Cut the area for the text
    linear_extrude(2)
        square([length + 2, width + 2], center = true);
    // Fit the text into the area based on the length
    color("green")
        linear_extrude(1.5, center = true, convexity = 4)
            resize([length, 0], auto = true)
                text("Text goes here!", valign = "center", halign = "center");
}
```

![OpenSCAD - Fitting text into a given area](OpenSCAD - Fitting text into a given area)

### Create a mirrored object while retaining the original

The mirror() module just transforms the existing object, so it can't be used to generate symmetrical objects. However using the children() module, it's easily possible define a new module mirror_copy() that generates the mirrored object in addition to the original one.

```
// A custom mirror module that retains the original
// object in addition to the mirrored one.
module mirror_copy(v = [1, 0, 0]) {
    children();
    mirror(v) children();
}

// Define example object.
module object() {
    translate([5, 5, 0]) {
        difference() {
            cube(10);
            cylinder(r = 8, h = 30, center = true);
        }
    }
}

// Call mirror_copy twice, once using the default to
// create a duplicate mirrored on X axis and
// then mirror again on Y axis.
mirror_copy([0, 1, 0])
    mirror_copy()
        object();
```

![OpenSCAD - Mirror Copy](OpenSCAD - Mirror Copy)

### Arrange parts on a spatial array

An operator to display a set of objects on an array.

```
// Arrange its children in a regular rectangular array
//  spacing - the space between children origins
//  n       - the number of children along x axis
module arrange(spacing=50, n=5) {
    nparts = $children;
    for(i=[0:1:n-1], j=[0:nparts/n])
        if (i+n*j < nparts)
            translate([spacing*(i+1), spacing*j, 0])
                children(i+n*j);
}

arrange(spacing=30,n=3) {
    sphere(r=20,$fn=8);
    sphere(r=20,$fn=10);
    cube(30,center=true);
    sphere(r=20,$fn=14);
    sphere(r=20,$fn=16);
    sphere(r=20,$fn=18);
    cylinder(r=15,h=30);
    sphere(r=20,$fn=22);
}
```

![OpenSCAD - An array of objects](OpenSCAD - An array of objects)

A handy operator to display a lot of parts of a project downloaded from Thingiverse.

Note: the following usage fails:

```
arrange() for(i=[8:16]) sphere(15, $fn=i);
```

because the for statement do an implicit union of the inside objects creating only one child.

### Rounding polygons

Polygons may be rounded by the offset operator in several forms.

```
p = [ [0,0], [10,0], [10,10], [5,5], [0,10]];

polygon(p);

// round pointed vertices and enlarge
translate([-15, 0])
    offset(1,$fn=24) polygon(p);

// round concavities and shrink
translate([-30, 0])
    offset(-1,$fn=24) polygon(p);

// round concavities and preserve polygon dimensions
translate([15, 0])
    offset(-1,$fn=24) offset(1,$fn=24) polygon(p);

// round pointed vertices and preserve polygon dimensions
translate([30, 0])
    offset(1,$fn=24) offset(-1,$fn=24) polygon(p);

// round all vertices and preserve polygon dimensions
translate([45, 0])
    offset(-1,$fn=24) offset(1,$fn=24)
    offset(1,$fn=24) offset(-1,$fn=24) polygon(p);
```

![The roundings of a polygon by OpenSCAD operator offset()](The roundings of a polygon by OpenSCAD operator offset())

### Filleting objects

Filleting is the 3D counterpart of the rounding of polygons. There is no offset() operators for 3D objects, but it may be coded using minkowski operator.

```
difference(){
    offset_3d(2) offset_3d(-2)   // exterior fillets
    offset_3d(-4) offset_3d(4)   // interior fillets
    basic_model();
    // hole without fillet
    translate([0,0,10])
        cylinder(r=18,h=50);
}

// simpler (faster) example of a negative offset
* offset_3d(-4)difference(){
    cube(50,center=true);
    cube(50,center=false);
}

module basic_model(){
    cylinder(r=25,h=55,$fn=6);// $fn=6 for faster calculation
    cube([80,80,10], center=true);
}

module offset_3d(r=1, size=1000) {
    n = $fn==undef ? 12: $fn;
    if(r==0) children();
    else
    if( r>0 )
        minkowski(convexity=5){
            children();
            sphere(r, $fn=n);
        }
    else {
        size2 = size*[1,1,1];// this will form the positv
        size1 = size2*2;     // this will hold a negative inside
        difference(){
            cube(size2, center=true);// forms the positiv by substracting the negative
            minkowski(convexity=5){
                difference(){
                    cube(size1, center=true);
                    children();
                }
                sphere(-r, $fn=n);
            }
        }
    }
}
```

![OpenSCAD - Filleting an object](OpenSCAD - Filleting an object)

Note that this is a very time consuming process. The minkowski operator adds vertices to the model so each new offset_3d takes longer than the previous one.

### Computing a bounding box

There is no way to get the bounding box limits of an object with OpenSCAD. However, it is possible to compute its bounding box volume. Its concept is simple: hull() the projection of the model on each axis (1D sets) and minkowski() them. As there is no way to define a 1D set in OpenSCAD, the projections are approximated by a stick whose length is the size of the projection.

```
module bbox() {
    // a 3D approx. of the children projection on X axis
    module xProjection()
        translate([0,1/2,-1/2])
            linear_extrude(1)
                hull()
                    projection()
                        rotate([90,0,0])
                            linear_extrude(1)
                                projection() children();

    // a bounding box with an offset of 1 in all axis
    module bbx()
        minkowski() {
            xProjection() children();             // x axis
            rotate(-90)                            // y axis
                xProjection() rotate(90) children();
            rotate([0,-90,0])                      // z axis
                xProjection() rotate([0,90,0]) children();
        }

    // offset children() (a cube) by -1 in all axis
    module shrink()
        intersection() {
            translate([ 1, 1, 1]) children();
            translate([-1,-1,-1]) children();
        }

    shrink() bbx() children();
}

module model()
    color("red")
    union() {
        sphere(10);
        translate([15,10,5]) cube(10);
    }

model();
%bbox() model();
```

![OpenSCAD - The bounding box of an object](OpenSCAD - The bounding box of an object)

The cubes in the offset3D operator code of the Filleting objects tip could well be replaced by the object bounding box dispensing the artificial argument size.

As an example of solving problems with this, with a little manipulation of the result, the bounding box can be used to augment features around arbitrary text without knowing the size of the text. In this example a square base plate for the text is created with two holes inserted into it at the ends of the text, all having fixed margins. This works by taking the projection of the bounding box, expanding it evenly, shrinking the y dimension to a sliver, and extending the x direction outward by a sliver, and subtracting off the expanded bounding box projection again, leaving two near point-like objects which can be expanded with offset into the holes.

The image shows the (transparent) bounding box of a red model generated by the code:

```
my_string = "Demo text";

module BasePlate(margin) {
    minkowski() {
        translate(-margin) square(2*margin);
        projection() bbox() linear_extrude(1) children();
    }
}

module TextThing() {
    text(my_string, halign="center", valign="center");
}

hole_size = 3;
margwidth = 2;

linear_extrude(1)
difference() {
    BasePlate([2*(hole_size+margwidth), margwidth]) TextThing();
    offset(hole_size) {
        difference() {
            scale([1.001, 1])
                resize([-1, 0.001])
                    BasePlate([hole_size+margwidth, margwidth]) TextThing();
            BasePlate([hole_size+margwidth, margwidth]) TextThing();
        }
    }
}

linear_extrude(2) TextThing();
```

![OpenSCAD - Text bounding box manipulation](OpenSCAD - Text bounding box manipulation)

### Data Height Map

The builtin module surface() is able to create a 3D object that represents the heightmap of data in a matrix of numbers. However, the data matrix for surface() should be stored in an external text file. The following module does the exact heightmap of surface() for a data set generated by the user code.

```
data = [ for(a=[0:10:360])
    [ for(b=[0:10:360])
        cos(a-b)+4*sin(a+b)+(a+b)/40 ]
];

surfaceData(data, center=true);
cube();

// operate like the builtin module surface() but
// from a matrix of floats instead of a text file
module surfaceData(M, center=false, convexity=10){
    n = len(M);
    m = len(M[0]);
    miz = min([for(Mi=M) min(Mi)]);
    minz = miz< 0? miz-1 : -1;
    ctr = center ? [-(m-1)/2, -(n-1)/2, 0]: [0,0,0];
    points = [ // original data points
        for(i=[0:n-1])for(j=[0:m-1]) [j, i, M[i][j]] +ctr,
        [ 0,   0,   minz ] + ctr,
        [ m-1, 0,   minz ] + ctr,
        [ m-1, n-1, minz ] + ctr,
        [ 0,   n-1, minz ] + ctr,
        // additional interpolated points at the center of the quads
        // the points bellow with `med` set to 0 are not used by faces
        for(i=[0:n-1])for(j=[0:m-1])
            let( med = i==n-1 || j==m-1 ? 0:
                (M[i][j]+M[i+1][j]+M[i+1][j+1]+M[i][j+1])/4 )
            [j+0.5, i+0.5, med] + ctr
    ];
    faces = [ // faces connecting data points to interpolated ones
        for(i=[0:n-2])
            for(j=[i*m:i*m+m-2])
                each [ [ j+1,   j,   j+n*m+4 ],
                       [   j, j+m,   j+n*m+4 ],
                       [ j+m, j+m+1, j+n*m+4 ],
                       [ j+m+1, j+1, j+n*m+4 ] ] ,
        // lateral and bottom faces
        [ for(i=[0:m-1])       i,         n*m+1, n*m   ],
        [ for(i=[m-1:-1:0])   -m+i+n*m,   n*m+3, n*m+2 ],
        [ for(i=[n-1:-1:0])    i*m,       n*m,   n*m+3 ],
        [ for(i=[0:n-1])       i*m+m-1,   n*m+2, n*m+1 ],
        [n*m, n*m+1, n*m+2, n*m+3 ]
    ];
    polyhedron(points, faces, convexity);
}
```

![OpenSCAD - A heightmap generated by surfaceData()](OpenSCAD - A heightmap generated by surfaceData())

## Strings

### Integer from Numeric String (Decimal or Hex)

Converts number in string format to an integer, (s2d - String 2 Decimal - named before I added hex to it...)

e.g. `echo(s2d("314159")/100000); // shows ECHO: 3.14159`

```
function s2d(h="0",base=10,i=-1) =
    // converts a string of hexa/or/decimal digits into a decimal
    // integers only
    (i == -1)
        ? s2d(h,base,i=len(h)-1)
        : (i == 0)
            ? _chkBase(_d2n(h[0]),base)
            : _chkBase(_d2n(h[i]),base) + base*s2d(h,base,i-1);

function _chkBase(n,b) =
    (n>=b)
        ? (0/0)        // 0/0=nan
        : n;

function _d2n(digitStr) =
    // SINGLE string Digit 2 Number, decimal (0-9) or hex (0-F) - upper or lower A-F
    (digitStr == undef
        || len(digitStr) == undef
        || len(digitStr) != 1)
    ? (0/0) // 0/0 = nan
    : _d2nV()[search(digitStr,_d2nV(),1,0)[0]][1];

function _d2nV()=
    // Digit 2 Number Vector, use function instead of variable - no footprints
    [ ["0",0],["1",1],["2",2],["3",3],["4",4],
      ["5",5],["6",6],["7",7],["8",8],["9",9],
      ["a",10],["b",11],["c",12],
      ["d",13],["e",14],["f",15],
      ["A",10],["B",11],["C",12],
      ["D",13],["E",14],["F",15]
    ];
```

### Bundt Cake

```
// Bundt Cake Replica - Hand Size (10cm x 5cm)

// Parameters
cake_radius = 50;           // 10 cm diameter
cake_height = 50;           // 5 cm tall
center_hole_radius = 20;
ridge_count = 12;
ridge_depth = 5;

/* [Hidden] */
$fa=1;$fs=0.5;

// Main Cake Shape
module bundtCake() {
    difference() {
        // Outer cake body
        union() {
            for (i = [0:360/ridge_count:360]) {
                rotate([0,0,i])
                    translate([cake_radius - ridge_depth, 0, 0])
                        cylinder(h = cake_height, r = ridge_depth);
            }
            cylinder(h = cake_height, r = cake_radius - ridge_depth);
        }
        // Center hole
        translate([0,0,-1])
            cylinder(h = cake_height + 2, r = center_hole_radius);
    }
}

bundtCake();
```

## Debug

### Debug Tap function

Similar to Ruby's Tap function. This function encapsulates the echo to console side-effect, if $_debug is true and returns the object.

e.g. given $_debug is true; `x = debugTap(2 * 2, "Solution is: "); // shows ECHO: Solution is: 4`

```
function debugTap(o, s) = let(
    nothing = [ for (i = [1:1]) if ($_debug) echo(str(s, ": ", o)) ]) o;

// usage
// note: parseArgsToString() just concats all the args and returns a pretty str
$_debug = true;

// doubles 'x'
function foo(x) =
    let(
        fnName = "foo",
        args = [x]
    )
    debugTap(x * x, str(fnName, parseArgsToString(args)));

x = 2;
y = foo(x);

echo(str("x: ", x, " y: ", y));
// console display:
// ECHO: "foo(2): 4"
// ECHO: "x: 2 y: 4"
```

---

Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Tips_and_Tricks&oldid=4618388"


---

# OpenSCAD User Manual/FAQ

## General

### How is OpenSCAD pronounced?

The intended pronunciation is: Open - ess - cad.

### What is the meaning of the S in OpenSCAD?

The S stands for Solid, as in Solid modeling.

### Why is there no preview on Windows in a virtual machine?

It is likely that your VM or session does not support the required version of OpenCSG/OpenGL for correct preview rendering.

Note: Also applies when working via Remote desktop using RDP (Windows) or XfreeRDP (Linux)

A solution is to use software rendering via the Mesa driver from the MSYS2 package. Download the repository for the version for your version of Windows:

- 64bit - [mingw64 repository](https://packages.msys2.org/package/mingw-w64-x86_64-mesa?repo=mingw64)
- 32bit - mingw32 repository

> [Deprecated: Windows as a 32-bit Operating System is deprecated after now and will be removed in a future release. Use a 64 bit version of Windows instead.]

A decompression app like 7-zip or WinRAR is needed to extract the contents of the \*pkg.tar.xz file.

Find the file `mingw64\bin\opengl32.dll` in the extracted folder. Note that even in a 64-bit system, the name of the .dll still has "32" in it.

Copy `opengl32.dll` to the OpenSCAD installation directory, which is normally `c:\program files` (on a 64-bit system) or `c:\program files(x86)` (on a 32-bit system).

Restart OpenSCAD and preview should function normally.

## Display

### Why isn't preview working?

Some systems, in particular Intel GPUs on Windows, tend to have old or broken OpenGL drivers. This affects preview rendering when using difference or intersection operators.

The following tends to improve the situation: Edit->Preferences->Advanced->Force Goldfeather (see screenshot).

![Force Goldfeather](images/Force_Goldfeather.png)

### What are those strange flickering artifacts in the preview?

![OpenSCAD display issue with coincident faces](images/OpenSCAD_display_issue_coincident_faces.png)

This is typically caused by differencing objects that share one or more faces, e.g.:

```openscad
cube_size = 20;
difference() {
    cube(cube_size, center = true);
    cylinder(r = 10, h = cube_size, center = true);
}
```

In some cases the final render works fine, but designs with coincident resulting faces should be considered a design with undefined behavior, as a proper render result is not guaranteed. The fundamental source of the issue is not a bug, but an intrinsic property of the inability to rigorously compare floating point values which might have undergone trigonometric operations (like rotations) resulting in irrational values that simply cannot be represented exactly in any manner. Because of this you can get near-coincident surfaces where part of the surface is inside and part of the surface is outside, or zero-volume regions, resulting in a render error that the output is not manifold. In simple tests like this example, the render will typically be okay giving false confidence in this approach, but if both pieces were subject to an equal rotation it can fail to render in a manner which is slightly dependent on the platform the program is running on. This will typically result in a warning at render, and a rendered piece being removed from the final output.

The solution to this is to always provide a clear overlap for surfaces which are to be removed, such as by adding a small value called an epsilon:

```openscad
cube_size = 20;
difference() {
    cube(cube_size, center = true);
    cylinder(r = 10, h = cube_size+0.01, center = true);
}
```

Note that a similar issue occurs with unions, where coincident faces to be merged must also be given an epsilon value to guarantee they are always inside.

There is a second preview-only flickering result which can also occur with faces that are not even supposed to be visible in the final result, for example because they're were negative faces used for removal by a difference() operation. This second case impact of fully properly removed faces (or negative faces) is an artifact of the library used for drawing the preview, and will not affect the render. If a clean preview result is desired such as for imaging output, these can be adjusted by an epsilon value in the same manner. See [this discussion](https://github.com/openscad/openscad/issues/1793) for other details.

### Why are some parts (e.g. holes) of the model not rendered correctly?

![OpenSCAD display issue with convexity setting too low](images/OpenSCAD_display_issue_convexity.png)

In complex cases, the convexity of the objects is not known. For these objects, the convexity parameter can be used to specify the value. Note that higher values cause a slowdown in preview.

The convexity parameter specifies the maximum number of front sides (or back sides) a ray intersecting the object might penetrate. For example, the convexity of a sphere is one and the convexity of a torus is two. This parameter is only needed for correctly displaying the object in OpenCSG preview mode when using the standard Goldfeather algorithm and has no effect on mesh rendering.

![This figure has a convexity of 2.](images/convexity_2.png)

This image shows a 2D shape with a convexity of 2, as the ray indicated in red intersects with the 2D shape in at most two sections. The convexity of a 3D shape would be determined in a similar way.

Hint: Finding the right convexity value can be difficult. Setting it to 10 should work fine for most cases.

Another workaround might be to use `render()` to force the generation of a mesh even in preview mode.

```openscad
difference() {
    linear_extrude(height = 15 /* , convexity = 2 */) {
        difference() {
            square([50, 50]);
            translate([10, 10]) circle(5);
        }
    }
    translate([25, 25]) cube([5, 5, 40], center = true);
}
```

### Why does difference (or intersection) sometimes not work in preview?

![Sphere with cube subtracted, with camera outside the invisible cube.](images/sphere_cube_subtracted_outside.png)

![The same model, with the view rotated slightly so the camera is inside the invisible cube.](images/sphere_cube_subtracted_inside.png)

In perspective mode, the previewer does not process differences or intersections where the camera is inside the invisible object. This is most commonly seen when using a large object to cut away significant parts of the model.

```openscad
difference() {
    sphere(10);
    cube(100);
}
```

Workarounds:

- Keep the camera outside the invisible objects.
- Keep the invisible objects modest-sized so that it is easier to keep the camera outside them.
- Wrap `render()` around the difference or intersection.
- Use orthogonal mode.

### Why does my model appear with F5 but not F6?

![OpenSCAD polyhedron with flipped face](images/OpenSCAD_polyhedron_flipped_face.png)

This can be caused by polyhedra with flipped faces.

This can be visualized in "Thrown Together" display mode. See misordered faces for details.

If the model imports external STL files, see also import related question. It is confusing that the error only occurs if there is more than one object involved, ie it "works" until you add another item.

```openscad
points = [[5,5,0],[5,-5,0],[-5,-5,0],[-5,5,0],[0,0,3]];
faces = [[0,1,4],[1,2,4],[2,3,4],[3,4,0],[1,0,3],[2,1,3]];
polyhedron(points, faces);
```

### Why is the preview so slow?

Intersections or difference operations that use objects to cut holes, chamfer, or generally remove part of a solid are expensive. The preview rendering expects to have only primitive objects used as negatives so anything more complex has to be unpacked.

For example (using A+B = union() / A-B = difference() / A\*B = intersection()):

```
A - B*C - D*E
```

becomes:

```
A-B-D + A-B-E + A-C-D + A-C-E
```

..and if A is more complex:

```
A+B - C*D - E*F
```

becomes:

```
A-C-E + A-C-F + A-D-E + A-D-F + B-C-E + B-C-F + B-D-E + B-D-F
```

All combinations have to be rendered, which can take some time, especially on older GPUs, and especially on low-end Intel GPUs.

## Import

### How can I clean up STL issues?

To work well the meshes in an STL file should be be manifold, not contain holes, nor intersect itself. Even with such issues the import process may well succeed and show something in the preview panel. However, operating on that object, or doing a full render, will likely

- emit warnings about it not being manifold
- cause it to disappear
- to emit CGAL errors like:

```
CGAL error in CGAL_Build_PolySet: CGAL ERROR: assertion violation!
Expr: check_protocoll == 0
File: /user/openscad_deps/../CGAL/Polyhedron_incremental_builder_3.h
```

or

```
CGAL error in CGAL_Nef_polyhedron3(): CGAL ERROR: assertion violation!
Expr: pe_prev->is_border() || !internal::Plane_constructor<Plane>::get_plane(pe_prev->facet(),pe_prev->facet()->plane()).is_degenerate()
```

There are several ways to clean an STL file:

#### MeshLab

This free software can fix all issues.

Using MeshLab, you can do:

- Render > Show non Manif Edges
- Render > Show non Manif Vertices

If bad edges or verticies are found, use menu:

- Filters > Selection > Select non Manifold Edges

or

- Filters > Selection > Select non Manifold Vertices

and then Apply and Close. IF there are bad items a button, "Delete the current set of selected vertices..." should be used to remove them. Otherwise the screen will show "0 non manifold edges" and "0 non manifold vertices"

There is a useful explanation on [YouTube](https://www.youtube.com/watch?v=oDx0Tgy0UHo) in the Meshlab Channel.

Now all of the holes you made have to be filled back in. Select a hole, click Fill, and then Accept, and repeat until the mesh is correct.

Use menu File > Export Mesh to export to STL.

#### Using Blender

Using Blender is a possible alternative to Meshlab:

1. Start Blender
2. 'X, 1' to remove the default object
3. File > Import > STL
4. 'Tab' to edit the mesh
5. 'A' to de-select all vertices
6. 'Alt+Ctrl+Shift+M' to select all non-manifold vertices
7. 'MMB' to rotate, 'Shift+MMB' to pan, 'wheel' to zoom
8. 'C' for "circle" select, 'Esc' to finish
9. 'Alt+M, 1' to merge or 'Space' and search for "merge" as alternative

This instruction is showing the Key stroke shortcuts ('X' etc) to Blender operations and MMB is Middle Mouse Button.

Merging vertices is a useful way of filling holes where the vertices are so closely packed that the slight change in geometry is unimportant compared to the precision of a typical 3D printer

### Why does my imported STL file appear with F5 but not F6?

This is mostly caused by bad geometry in the STL file. Use an app like Blender, MeshLab, NetFabb, or Prusa Slicer to import, repair and re-export the clean version. In essence the model needs to be manifold to be processed in OpenSCAD.

Even a bad model may appear in preview mode as there is no real geometry yet. The preview actually painting pixels based on a view of the model.

A specific issue are the so called "Zero faces" where the 3 points of a triangle are co-linear, which is currently not handled well in OpenSCAD.

#### Using MeshLab

MeshLab has a filter to remove zero faces by flipping edges of polygons

- Filters -> Cleaning and Repairing -> Remove T-Vertices by Edge-Flip

Set the Ratio to a high value (e.g. 1000000), otherwise it's possible the model gets distorted.

#### Using Blender

Blender has a 3D-Printing-Toolbox Plug-in (needs to be enabled in the UserSettings) that can show issues with the STL file. See http://wiki.blender.org/index.php/Extensions:2.6/Py/Scripts/Modeling/PrintToolbox

#### Prusa Slicer

In the menu File > Repair STL will take a file and make it acceptable to Slicer, if it can.

### What are "Unsupported DXF Entity" warnings?

Warning messages like `Unsupported DXF Entity 'SPLINE' (1c1) in "file.dxf"` mean that the DXF file was written using features that the our import processor does not support. The importer will still import the parts it can, but your model may be incomplete.

When using Inkscape to draw a design it is good practice to convert all Bezier curves to short line segments using

- Extensions > Modify Path > Flatten Beziers ...

which pops up a dialog with a setting for the max length of the line segments to use. Shorter lines, thus more lines, produce smoother results at the cost of more processing and data. When exporting select format "AutoCAD DXF R14".

Exporting to SVG or DXF will work with the `import()` module to bring your drawing into OpenSCAD.

A more detailed tutorial is available at [RepRap](http://repraprip.blogspot.de/2011/05/inkscape-to-openscad-dxf-tutorial.html).

### Can I import Inkscape 2D models to OpenSCAD?

Inkscape is an open source drawing program. Tutorials for transferring 2d DXF drawings from Inkscape to OpenSCAD are available here:

- [Simple drawing using only straight line path segments on RepRap](http://repraprip.blogspot.com/2011/05/inkscape-to-openscad-dxf-tutorial.html)
- [A complicated process for using text in OpenSCAD using conversion to Postscript](http://web.archive.org/web/20130318112610/http://tonybuser.com/?tag=inkscape%20http://tonybuser.com/?tag=inkscape). Obsolete since version 2021.01 added the text() module.
- [Extension for DXF Export w native support of Beziers](http://bobcookdev.com/inkscape/inkscape-dxf.html)
- [Convert any 2D image to a 3D object using OpenSCAD on Instructables](http://www.instructables.com/id/Convert-any-2D-image-to-a-3D-object-using-OpenSCAD/)
- [directly exports OpenSCAD file](https://cyberweb.cite-sciences.fr/wiki/doku.php?id=projets:de_inkscape_a_openscad) (French)

## Export

### How can I export multiple parts from one script?

![Image exported with PART="all"](images/export_part_all.png)

There is no way to directly export multiple parts from one script in one run. However, you can write your script so that it will generate each part separately, and run it multiple times.

In this example, the variable PART controls which part is being exported in the current run.

```openscad
PART = "all"; // [ all, tree, trunk, base]

module tree() {
    color("green") cylinder(r1 = 12, r2 = 1, h = 30);
    // ...
}

module trunk() {
    color("brown") cylinder(r = 3, h = 10);
    // ...
}

module base() {
    color("white") translate([-10, -10, 0]) cube([20, 20, 5]);
    // ...
}

if (PART == "tree") tree();
if (PART == "trunk") trunk();
if (PART == "base") base();
if (PART == "all") {
    base();
    translate([0, 0, 5]) trunk();
    translate([0, 0, 15]) tree();
}
```

When working interactively, you can use the Customizer to set the PART variable and control which part is generated.

It's possible to automate the process of exporting all of the parts by writing a shell script on MacOS or Linux, or a batch file on Windows. The shell script would look something like this:

```bash
# export parts as STL
openscad -DPART=\"tree\" -o tree.stl model.scad
openscad -DPART=\"trunk\" -o trunk.stl model.scad
openscad -DPART=\"base\" -o base.stl model.scad
# export image of all the parts combined
openscad -DPART=\"all\" -o model.png model.scad
```

Running this script once from the command line exports all of the parts to separate files.

### How can I export screenshots with higher resolution than the current window?

Right now that is not possible from the GUI, as the images are restricted to the actual display context. Using the File->Export->Export As Image menu always exports at viewport resolution.

It is however possible to generate higher resolution images via command line using the `--imgsize` parameter. This uses a separate drawing context, size-limited by memory and the graphics driver, to generate the image. For example, on Linux, the Mesa driver for Intel UHD Graphics 620 (Kabylake GT2) seems to max out at an image resolution of about 16000×16000.

```bash
$ openscad --imgsize 16000,16000 -o CSG.png CSG.scad
ECHO: version = [2019, 1, 0]
Compiling design (CSG Products normalization)...
Normalized CSG tree has 6 elements
$ file CSG.png
CSG.png: PNG image data, 16000 x 16000, 8-bit/color RGB, non-interlaced
```

## Language

### Why am I getting an error when writing a = a + 1?

The short answer is that variables cannot be changed; they can only be assigned once.

There are several ways to replace iteration; for some examples see the Tips and Tricks section.

When we add in the effect of block statements opening local scopes it is possible that an assignment may look like it is breaking this rule. But reusing a variable name, like "x", inside a block is defining a new, local variable so using the "x" from outside the block on the RHS of the "=" sign is allowed.

```openscad
x=12;
if(true) {
    x=x+1; // local = global + 1
    echo(x); // ECHO: 13
}
echo(x); //ECHO: 12
```

The deeper answer is based on OpenSCAD being a declarative functional language. In a functional language a script is list of instructions (statements) that are compiled into a run-able form using a script's initial conditions as the basis for every calculation, decision, and loop carried out in strict order. Statements in the script are only ever visited once and every variable that receives the value of a calculation can only be set once, effectively making it a constant. Decisions, If-Then-Else statements, are made with the values extant when their statement is compiled and only the statements on the branch selected make it to the run-able code. Loops are unrolled so the body of the loop is copied as many times as the loop should run, and in each copy the loop control values are set as "constants" of the updated value by the compilation process.

The view that "variables may not be changed" is a limitation can hopefully be changed by showing how to better exploit the opportunities.

### Are measures being considered to help procedural programmers?

**A "reduce" function**

to help with collecting information depending on a list of input. Anyone who knows what the function should do could use the undefined link to start a new page to capture the design

**Recursion is fine**

we already detect and handle Tail-End Recursion now, but additional help features are possible

**Disallow Reassignment**

The editor could be enhanced to fail with an error when x=x+1 is detected.

**Command-Line Variable Override**

a new syntax or other mechanism for achieving this would be part of implementing Disallow Reassignment.

**Aspects of the Zen of Functional Language Processing**

Imagine that all the expressions in a script are executed in parallel. Any dependency of one expression on another must be made explicit by hierarchical grouping. This view makes iterating to accumulating information unnecessary.

OpenSCAD functions operate the way that a spreadsheet cell does. A spreadsheet formula cannot increment itself as that would be circular reference.

It might be possible to create features to help programmers apply their procedural programming skills in OpenSCAD. But the team is working in alignment with the technology.

Learning something from plethora of HTML generators out there all trying to create web pages we note that they are used to make a script that make snapshot "images" every time a web page is refreshed. In this vein there are OpenSCAD "generators" in other programming languages (Python, Ruby, C++, Haskell, Clojure are known) just as there are tools offering JavaScript interfaces for similar purposes (OpenJSCAD, CoffeeSCAD).

However until the need for such a solution becomes overwhelming, and a good candidate for the language to use, it's better to keep these things separate.

See also for help: List Comprehension, Tips & Tricks, Recursive Functions

## User Interface

### OpenSCAD isn't adhering to my GTK desktop theme

You may need to install package "qt5-style-plugins" on Debian-based systems and "qt5-qtstyleplugins" on Fedora-based systems, then set environment variable when calling openscad `QT_QPA_PLATFORMTHEME=gtk2 openscad`

To make the setting permanent, add `export QT_QPA_PLATFORMTHEME=gtk2` to your user's `~/.profile`

### OpenSCAD GUI is not scaled in Gnome on a 4K / HIDPI Monitor

The GUI Framework Qt used by OpenSCAD seems to need an extra hint to automatically scale correctly for 4K / HIDPI Monitors on Gnome/X11 (e.g. reported on Ubuntu 22.10 with fractional scaling set to 125%).

Copy `openscad.desktop` from `/usr/share/applications/` to `~/.local/share/applications`

Change `Exec=openscad` to `Exec=env QT_AUTO_SCREEN_SCALE_FACTOR=1 openscad`

### I'm not getting any menubar when running OpenSCAD in Ubuntu, how can I get it back?

This seems to be caused by Ubuntu messing with Qt to move the menubar somewhere else (e.g. top of the screen).

That problem hits other applications too, see https://bugs.launchpad.net/ubuntu/+source/appmenu-qt5/+bug/1307619

There are two things that could help:

- Set the `QT_QPA_PLATFORMTHEME` environment variable to an empty string (the default value is probably "appmenu-qt5") or simply run OpenSCAD with `QT_QPA_PLATFORMTHEME= openscad`
- Remove the `appmenu-qt5` package to globally disable menubar changes for all applications

### Why are the error line numbers wrong?

That is a limitation/bug in the current parser that handles `include<>` basically as copy&paste of content. In some cases it's possible to work around the issue by placing the `include<>` statements at the end of the file.

When depending on libraries, it's recommended to use `use<>` instead which does not have that problem and also automatically inhibits any top-level geometry of that file (which might be there as demo for the library).

### I don't like the editor, can I use my favourite editor instead?

Yes, OpenSCAD supports a special mode that reloads the files if they are modified externally. To enable this mode, check the Design -> Automatic Reload and Preview option and just close the editor window (or use View -> Hide Editor).

See also the section in the user manual: [Using an external Editor with OpenSCAD](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Using_an_external_Editor_with_OpenSCAD)

As an example, here's a script that runs vim as editor and also starts OpenSCAD, which takes the model viewer role.

It supports 3 modes

- Run with no parameters, it opens a temp file for quick testing, which it deletes.
- Run with the name of a non-existent file, it starts the file with a default license header.
- Run with the name of an existing file, it simply opens it.

```bash
#!/bin/bash
FILE="$1"
AUTHOR="Your Name Here"
YEAR="$(date "+%Y")"
LICENSE="// Created in $YEAR by $AUTHOR.\n// This work is released with CC0 into the public domain.\n// https://creativecommons.org/publicdomain/zero/1.0/"

# increase stack size to allow deeper recursion
ulimit -s 65536

if [ "$FILE" == "" ]
then
    TEMPF=`mktemp --suffix=.scad`
    openscad "$TEMPF" >/dev/null 2>/dev/null &
    vim "$TEMPF"
    rm -f "$TEMPF"
    exit
fi

if [ ! -e "$FILE" ]
then
    echo -e "$LICENSE" >> "$FILE"
fi

openscad "$FILE" >/dev/null 2>/dev/null &
vim "$FILE"
```

## Errors / Problems

### Why am I getting "no top level geometry to render"?

This can have different reasons, some common ones include

**Missing / Commented out module call**

Using the % modifier does not only make the part transparent, it also causes the part to be excluded in the final render!

```openscad
module model() {
    cube(20);
}
%model();
```

**Difference / Intersection with wrong translated objects**

The easiest way to solve this type of issues is to highlight the objects using the # modifier and see if the objects are placed at the position where they should be.

**Importing broken STL files**

See Why is my imported STL file appearing with F5 but not F6?

### OpenSCAD crashed/was killed, are my unsaved changes lost?

Before starting a preview or render a backup file is made of the current .scad file. It is saved in the user's Documents folder in an "OpenSCAD" folder

- ON Windows 11: `C:\Users\xxxx\Documents\OpenSCAD\backups`
- ON Linux: `$HOME/.local/share/OpenSCAD/backups`

The path can be seen in the app in the pop-up window shown by menu item Help > Library Info dialog titled "Backup Path".

### OpenSCAD crashes on some machines with Intel graphics drivers

For more details, see https://github.com/openscad/openscad/issues/2442

### OpenSCAD fails to run due to missing DLLs

This is an issue with the special Windows N (Europe) and KN (Korea) versions from which the Windows Media Framework was removed by a ruling against anti-competitive practices by the European Commission in 2004.

The missing files are EVR.dll, MF.dll, or MFPlat.dll

OpenSCAD, starting with release 2019.05, depends on some of the features so it fails to run on those systems.

The missing Windows Media Framework can be added by installing the correct "Media Feature Pack for N versions" from the list Microsoft provides in [KB3145500](https://support.microsoft.com/en-us/help/3145500/media-feature-pack-list-for-windows-n-editions). For Windows 10 version N, there's a dedicated download page with Windows version selector at: [https://www.microsoft.com/en-us/software-download/mediafeaturepack](https://www.microsoft.com/en-us/software-download/mediafeaturepack).

Starting with Windows 10 1909 you can't download the Media Features from the Microsoft Website directly - instead you have to use Windows Settings > Apps > Apps and Features > Optional Features > Add a Feature and find the Media Feature Pack in the list of available Optional Features. Afterwards reboot and it should work.

Note 2026-02-19: This still applies to Windows 11

## Reporting Bugs, Requesting Features

### How do I report bugs?

Bugs in OpenSCAD are best reported in the [GitHub issue tracker](https://github.com/openscad/openscad/issues). If you are not sure it's a bug, ask about it in the IRC chat.

Please search [existing issues](https://github.com/openscad/openscad/issues) if the bug was already reported. If you find something similar but are unsure of its relevance, create a new issue and mention the (possibly) related one.

Make your report as complete as possible so that we can reproduce it and understand the cause. These are info items we like to see:

- **The OpenSCAD version**
  - Menu Help > About and Help > Library Info or
  - Command line: `openscad --info`
- **The Operating System name and version**
  - ON Windows: Settings > System > About : sections Device and Windows
- **Describe your workflow that led to the problem**
- **graphics issues**
  - The OpenGL driver information
- **your script (if relevant)**
  - If short paste it in, otherwise a link to it on something like [pastebin](https://pastebin.com/) is better.

### How do I request new features?

New features or changes/extensions to existing features can be requested in the GitHub issue tracker at https://github.com/openscad/openscad/issues.

Please make an effort to clearly explain the new feature/change as detailed as possible. Including some background about why you think this feature would be useful to you and other people helps a lot and increases the chances of it being implemented.

### How do I report OS specific bugs?

The versions for Windows and Mac OS X are currently maintained by the OpenSCAD team, so please use the [GitHub issue tracker](https://github.com/openscad/openscad/issues) to report issues.

The [nightly builds](https://build.opensuse.org/package/show/home:t-paul/OpenSCAD) hosted on the [openSUSE build service](https://build.opensuse.org/) are also maintained by the OpenSCAD team, so please use the [GitHub issue tracker](https://github.com/openscad/openscad/issues) for reporting issues with them.

The OpenSCAD versions in the various Linux distributions are usually maintained by them. Bugs specific to an OS should be reported in their respective systems:

- **Debian**
  - See ["please report it" directions](https://bugs.debian.org/cgi-bin/pkgreport.cgi?package=openscad)
- **Ubuntu**
  - See ["Report a bug" directions](https://launchpad.net/ubuntu/+source/openscad)
- **Fedora / Red Hat**
  - See [the current list](https://apps.fedoraproject.org/packages/openscad/bugs) and use [this page to report](https://bugzilla.redhat.com/buglist.cgi?component=openscad).
- **Arch Linux**
  - See ["reporting bug guidelines" directions](https://bugs.archlinux.org/index.php?string=openscad&status%5B%5D=)

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/FAQ&oldid=4619560"*


---

# OpenSCAD User Manual — Commented Example Projects, Command Glossary & CheatSheet

---

## Part 1: OpenSCAD User Manual / Commented Example Projects

*Source: Wikibooks, open books for an open world*

---

### Dodecahedron

*The Dodecahedron as rendered from the example.*

```openscad
//create a dodecahedron by intersecting 6 boxes
module dodecahedron(height)
{
  scale([height,height,height]) //scale by height parameter
  {
    intersection(){
      //make a cube
      cube([2,2,1], center = true);
      intersection_for(i=[0:4]) //loop i from 0 to 4, and intersect results
      {
        //make a cube, rotate it 116.565 degrees around the X axis,
        //then 72*i around the Z axis
        rotate([0,0,72*i])
        rotate([116.565,0,0])
        cube([2,2,1], center = true);
      }
    }
  }
}
//create 3 stacked dodecahedra
//call the module with a height of 1 and move up 2
translate([0,0,2])dodecahedron(1);
//call the module with a height of 2
dodecahedron(2);
//call the module with a height of 4 and move down 4
translate([0,0,-4])dodecahedron(4);
```

---

### Icosahedron

An icosahedron can be created from three orthogonal golden-ratio rectangles inside a `hull()` operation, where the golden ratio is φ.

*The icosahedron and its internal structure as rendered from the example.*

```openscad
phi=0.5*(sqrt(5)+1); // golden ratio

// create an icosahedron by intersecting 3 orthogonal golden-ratio rectangles
module icosahedron(edge_length) {
  st=0.0001; // microscopic sheet thickness
  hull() {
    cube([edge_length*phi, edge_length, st], true);
    rotate([90,90,0]) cube([edge_length*phi, edge_length, st], true);
    rotate([90,0,90]) cube([edge_length*phi, edge_length, st], true);
  }
}

// display the 3 internal sheets alongside the icosahedron
edge=10;
translate([-20,0,0]) union() {
  cube([edge*phi, edge, 0.01], true);
  rotate([90,90,0]) cube([edge*phi, edge, 0.01], true);
  rotate([90,0,90]) cube([edge*phi, edge, 0.01], true);
}
icosahedron(edge);
```

This icosahedron renders in an edge-up orientation. Rotating this icosahedron by a certain angle about the Y-axis results in a vertex-up orientation. Rotating by another angle about the X-axis results in a face-up orientation. The edge length is related to the inner diameter (distance between opposite faces).

---

### Icosphere

```openscad
// Code via reddit with triangle winding fixes, cannot add link due to
// wikibooks considering it spam.
// 4 is the realistic max.
// Don't do 5 or more, takes forever.
// set recursion to the desired level. 0=20 tris, 1=80 tris, 2=320 tris
module icosphere(radius=10, recursion=2, icoPnts, icoTris) {
  //t = (1 + sqrt(5))/2;
  //comment from monfera to get verts to unit sphere
  t = sqrt((5+sqrt(5))/10);
  s = sqrt((5-sqrt(5))/10);
  init = (icoPnts||icoTris) ? false : true; //initial call if icoPnts is empty

  // 1 --> draw icosphere from base mesh
  // 2 --> loop through base mesh and subdivide by 4 --> 20 steps
  // 3 --> loop through subdivided mesh and subdivide again (or subdivide by 16) --> 80 steps
  // 4 ...

  verts = [
    [-s, t, 0], //0
    [ s, t, 0],
    [-s,-t, 0],
    [ s,-t, 0],
    [ 0,-s, t],
    [ 0, s, t],
    [ 0,-s,-t],
    [ 0, s,-t],
    [ t, 0,-s],
    [ t, 0, s],
    [-t, 0,-s],
    [-t, 0, s]]; //11

  //base mesh with 20 faces
  tris = [
    //5 faces around point 0
    [ 0, 5, 11], //0
    [ 0, 1, 5],
    [ 0, 7, 1],
    [ 0, 10, 7],
    [ 0, 11, 10],
    // 5 adjacent faces
    [ 1, 9, 5], //5
    [ 5, 4, 11],
    [11, 2, 10],
    [10, 6, 7],
    [ 7, 8, 1],
    //5 faces around point 3
    [ 3, 4, 9], //10
    [ 3, 2, 4],
    [ 3, 6, 2],
    [ 3, 8, 6],
    [ 3, 9, 8],
    //5 adjacent faces
    [ 4, 5, 9], //15
    [ 2, 11, 4],
    [ 6, 10, 2],
    [ 8, 7, 6],
    [ 9, 1, 8]]; //19

  if (recursion) {
    verts = (init) ? verts : icoPnts;
    tris = (init) ? tris : icoTris;
    newSegments = recurseTris(verts,tris);
    newVerts = newSegments[0];
    newTris = newSegments[1];
    icosphere(radius,recursion-1,newVerts,newTris);
  } else if (init) { //draw the base icosphere if no recursion and initial call
    scale(radius) polyhedron(verts, tris);
  } else { // if not initial call some recursion has to be happened
    scale(radius) polyhedron(icoPnts, icoTris);
  }
}

// Adds verts if not already there,
// takes array of vertices and indices of a tri to expand
// returns expanded array of verts and indices of new polygon with 4 faces
// [[verts],[0,(a),(c)],[1,(b),(a)],[2,(c),(b)],[(a),(b),(c)]]
function addTris(verts, tri) = let(
  a= getMiddlePoint(verts[tri[0]], verts[tri[1]]), //will produce doubles
  b= getMiddlePoint(verts[tri[1]], verts[tri[2]]), //these are unique
  c= getMiddlePoint(verts[tri[2]], verts[tri[0]]), //these are unique
  aIdx = search(verts, a), //point a already exists
  l=len(verts)
) len(aIdx) ? [concat(verts,[a,b,c]),[[tri[0],l,l+2], //1
  [tri[1],l+1,l], //2
  [tri[2],l+2,l+1], //3
  [l,l+1,l+2]] ] : //4
  [concat(verts,[b,c]), [[tri[0],aIdx,l+1], //1
  [tri[1],l,aIdx], //2
  [tri[2],l+1,l],   //3
  [aIdx,l,l+1]] ]; //4

// Recursive function that does one recursion on the whole icosphere (auto recursion steps derived from len(tris)).
function recurseTris(verts, tris, newTris=[], steps=0, step=0) = let(
  stepsCnt = steps ? steps : len(tris)-1, //if initial call initialize steps
  newSegment=addTris(verts=verts,tri=tris[step]),
  newVerts=newSegment[0], //all old and new Vertices
  newerTris=concat(newTris,newSegment[1]) //only new Tris
) (stepsCnt==(step)) ? [newVerts,newerTris] :
  recurseTris(newVerts,tris,newerTris,stepsCnt,step+1);

// Get point between two verts on unit sphere.
function getMiddlePoint(p1, p2) = fixPosition((p1+p2)/2);

// Fix position to be on unit sphere
function fixPosition(p) = let(l=norm(p)) [p.x/l,p.y/l,p.z/l];
```

---

### Half-pyramid

An upside-down half-pyramid is a useful shape for 3D printing a support for an overhang protruding from a vertical wall. With sloping sides no steeper than 45°, no removable support structure needs to be printed.

While a half-pyramid can be made with a 4-sided cone (using the cylinder primitive) and subtracting a cube from half of it, the shape can be easily made in one operation by a scaled linear extrude of a rectangle having the middle of one edge on the origin.

*The half-pyramid as rendered from the example.*

```openscad
// Create a half-pyramid from a single linear extrusion
module halfpyramid(base, height) {
  linear_extrude(height, scale=0.01)
  translate([-base/2, 0, 0]) square([base, base/2]);
}
halfpyramid(20, 10);
```

---

### Bounding Box

*Bounding Box applied to an Ellipsoid*

```openscad
// Rather kludgy module for determining bounding box from intersecting projections
module BoundingBox()
{
  intersection()
  {
    translate([0,0,0])
    linear_extrude(height = 1000, center = true, convexity = 10, twist = 0)
    projection(cut=false) intersection()
    {
      rotate([0,90,0])
      linear_extrude(height = 1000, center = true, convexity = 10, twist = 0)
      projection(cut=false)
      rotate([0,-90,0])
      children(0);

      rotate([90,0,0])
      linear_extrude(height = 1000, center = true, convexity = 10, twist = 0)
      projection(cut=false)
      rotate([-90,0,0])
      children(0);
    }

    rotate([90,0,0])
    linear_extrude(height = 1000, center = true, convexity = 10, twist = 0)
    projection(cut=false)
    rotate([-90,0,0])
    intersection()
    {
      rotate([0,90,0])
      linear_extrude(height = 1000, center = true, convexity = 10, twist = 0)
      projection(cut=false)
      rotate([0,-90,0])
      children(0);

      rotate([0,0,0])
      linear_extrude(height = 1000, center = true, convexity = 10, twist = 0)
      projection(cut=false)
      rotate([0,0,0])
      children(0);
    }
  }
}

// Test module on ellipsoid
translate([0,0,40]) scale([1,2,3]) sphere(r=5);
BoundingBox() scale([1,2,3]) sphere(r=5);
```

---

### Linear Extrude extended use examples

#### Linear Extrude with Scale as an interpolated function

*Example Linear Extrude of a rectangle with scale following part of a sine curve function*

```openscad
//Linear Extrude with Scale as an interpolated function
// This module does not need to be modified,
// - unless default parameters want to be changed
// - or additional parameters want to be forwarded (e.g. slices,...)
module linear_extrude_fs(height=1,isteps=20,twist=0){
  //union of piecewise generated extrudes
  union(){
    for(i = [ 0: 1: isteps-1]){
      //each new piece needs to be adjusted for height
      translate([0,0,i*height/isteps])
      linear_extrude(
        height=height/isteps,
        twist=twist/isteps,
        scale=f_lefs((i+1)/isteps)/f_lefs(i/isteps)
      )
      // if a twist constant is defined it is split into pieces
      rotate([0,0,-(i/isteps)*twist])
      // each new piece starts where the last ended
      scale(f_lefs(i/isteps))
      obj2D_lefs();
    }
  }
}

// This function defines the scale function
// - Function name must not be modified
// - Modify the contents/return value to define the function
function f_lefs(x) =
  let(span=150,start=20,normpos=45)
  sin(x*span+start)/sin(normpos);

// This module defines the base 2D object to be extruded
// - Function name must not be modified
// - Modify the contents to define the base 2D object
module obj2D_lefs(){
  translate([-4,-3])
  square([9,12]);
}

//Top rendered object demonstrating the interpolation steps
translate([0,0,25])
linear_extrude_fs(height=20,isteps=4);
linear_extrude_fs(height=20);
//Bottom rendered object demonstrating the inclusion of a twist
translate([0,0,-25])
linear_extrude_fs(height=20,twist=90,isteps=30);
```

---

#### Linear Extrude with Twist as an interpolated function

*Example Linear Extrude of a rectangle with twist following part of a sine curve function*

```openscad
//Linear Extrude with Twist as an interpolated function
// This module does not need to be modified,
// - unless default parameters want to be changed
// - or additional parameters want to be forwarded (e.g. slices,...)
module linear_extrude_ft(height=1,isteps=20,scale=1){
  //union of piecewise generated extrudes
  union(){
    for(i = [ 0: 1: isteps-1]){
      //each new piece needs to be adjusted for height
      translate([0,0,i*height/isteps])
      linear_extrude(
        height=height/isteps,
        twist=f_left((i+1)/isteps)-f_left((i)/isteps),
        scale=(1-(1-scale)*(i+1)/isteps)/(1-(1-scale)*i/isteps)
      )
      //Rotate to next start point
      rotate([0,0,-f_left(i/isteps)])
      //Scale to end of last piece size
      scale(1-(1-scale)*(i/isteps))
      obj2D_left();
    }
  }
}

// This function defines the twist function
// - Function name must not be modified
// - Modify the contents/return value to define the function
function f_left(x) =
  let(twist=90,span=180,start=0)
  twist*sin(x*span+start);

// This module defines the base 2D object to be extruded
// - Function name must not be modified
// - Modify the contents to define the base 2D object
module obj2D_left(){
  translate([-4,-3])
  square([12,9]);
}

//Left rendered object demonstrating the interpolation steps
translate([-20,0])
linear_extrude_ft(height=30,isteps=5);
linear_extrude_ft(height=30);
//Right rendered object demonstrating the scale inclusion
translate([25,0])
linear_extrude_ft(height=30,scale=3);
```

---

#### Linear Extrude with Twist and Scale as interpolated functions

*Example Linear Extrude of a rectangle with twist and scale following part of a sine curve function*

```openscad
//Linear Extrude with Twist and Scale as interpolated functions
// This module does not need to be modified,
// - unless default parameters want to be changed
// - or additional parameters want to be forwarded
module linear_extrude_ftfs(height=1,isteps=20,slices=0){
  //union of piecewise generated extrudes
  union(){
    for(i=[0:1:isteps-1]){
      translate([0,0,i*height/isteps])
      linear_extrude(
        height=height/isteps,
        twist=leftfs_ftw((i+1)/isteps)-leftfs_ftw(i/isteps),
        scale=leftfs_fsc((i+1)/isteps)/leftfs_fsc(i/isteps),
        slices=slices
      )
      rotate([0,0,-leftfs_ftw(i/isteps)])
      scale(leftfs_fsc(i/isteps))
      obj2D_leftfs();
    }
  }
}

// This function defines the scale function
// - Function name must not be modified
// - Modify the contents/return value to define the function
function leftfs_fsc(x)=
  let(scale=3,span=140,start=20)
  scale*sin(x*span+start);

// This function defines the twist function
// - Function name must not be modified
// - Modify the contents/return value to define the function
function leftfs_ftw(x)=
  let(twist=30,span=360,start=0)
  twist*sin(x*span+start);

// This module defines the base 2D object to be extruded
// - Function name must not be modified
// - Modify the contents to define the base 2D object
module obj2D_leftfs(){
  square([12,9]);
}

//Left rendered objects demonstrating the steps effect
translate([0,-50,-60])
rotate([0,0,90])
linear_extrude_ftfs(height=50,isteps=3);
translate([0,-50,0])
linear_extrude_ftfs(height=50,isteps=3);

//Center rendered objects demonstrating the slices effect
translate([0,0,-60])
rotate([0,0,90])
linear_extrude_ftfs(height=50,isteps=3,slices=20);
linear_extrude_ftfs(height=50,isteps=3,slices=20);

//Right rendered objects with default parameters
translate([0,50,-60])
rotate([0,0,90])
linear_extrude_ftfs(height=50);
translate([0,50,0])
linear_extrude_ftfs(height=50);
```

---

### Rocket

*A rocket using rotate_extrude()*

```openscad
// increase the visual detail
$fn = 100;

// the main body :
// a cylinder
rocket_d = 30;   // 3 cm wide
rocket_r = rocket_d / 2;
rocket_h = 100;  // 10 cm tall
cylinder(d = rocket_d, h = rocket_h);

// the head :
// a cone
head_d = 40;   // 4 cm wide
head_r = head_d / 2;
head_h = 40;   // 4 cm tall

// prepare a triangle
tri_base = head_r;
tri_height = head_h;
tri_points = [[0,     0],
              [tri_base, 0],
              [0, tri_height]];

// rotation around X-axis and then 360° around Z-axis
// put it on top of the rocket's body
translate([0,0,rocket_h])
rotate_extrude(angle = 360)
polygon(tri_points);

// the wings :
// 3x triangles
wing_w = 2;    // 2 mm thick
many = 3;      // 3x wings
wing_l = 40;   // length
wing_h = 40;   // height
wing_points = [[0,0],[wing_l,0],[0,wing_h]];

module wing() {
  // let it a bit inside the main body
  in_by = 1;  // 1 mm
  // set it up on the rocket's perimeter
  translate([rocket_r - in_by,0,0])
  // set it upright by rotating around X-axis
  rotate([90,0,0])
  // set some width and center it
  linear_extrude(height = wing_w,center = true)
  // make a triangle
  polygon(wing_points);
}

for (i = [0: many - 1])
  rotate([0, 0, 370 / many * i])
  wing();
```

---

### Horns

*Horns, by translation and twisting.*

```openscad
// The idea is to twist a translated circle:
// -
/*
linear_extrude(height = 10, twist = 360, scale = 0)
  translate([1,0])
  circle(r = 1);
*/

module horn(height = 10, radius = 6,
            twist = 720, $fn = 50)
{
  // A centered circle translated by 1xR and
  // twisted by 360° degrees, covers a 2x(2xR) space.
  // -
  radius = radius/4;
  // De-translate.
  // -
  translate([-radius,0])
  // The actual code.
  // -
  linear_extrude(height = height, twist = twist,
    scale=0, $fn = $fn)
  translate([radius,0])
  circle(r=radius);
}

translate([3,0])
mirror()
horn();

translate([-3,0])
horn();
```

---

### Strandbeest

See the Strandbeest example here.

### Other 2D formats

### Paths

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Commented_Example_Projects&oldid=4388204"*

---
---

## Part 2: OpenSCAD User Manual / Command Glossary

*Source: Wikibooks, open books for an open world*

This is a Quick Reference; a short summary of all the commands without examples, just the basic syntax. The headings are links to the full chapters.

> **Please be warned:** The Command Glossary is presently outdated (03 2015).
> Please have a look at the Cheatsheet, instead:
> http://www.openscad.org/cheatsheet/

---

### Mathematical Operators

| Operator | Description |
|----------|-------------|
| `+` | Addition |
| `-` | Subtraction (also as unary negative) |
| `*` | Multiplication |
| `/` | Division |
| `%` | Modulo |
| `<` | Less than |
| `<=` | Less or equal |
| `==` | Equal |
| `!=` | Not equal |
| `>=` | Greater or equal |
| `>` | Greater than |
| `&&` | Logical and |
| `\|\|` | Logical or |
| `!` | Logical not |
| `<boolean> ? <valIfTrue> : <valIfFalse>` | Ternary operator |

---

### Mathematical Functions

```
abs ( <value> )
cos ( <degrees> )
sin ( <degrees> )
tan ( <degrees> )
asin ( <value> )
acos ( <value> )
atan ( <value> )
atan2 ( <y_value>, <x_value> )
pow( <base>, <exponent> )
len ( <string> ) len ( <vector> ) len ( <vector_of_vectors> )
min ( <value1>, <value2> )
max ( <value1>, <value2> )
sqrt ( <value> )
round ( <value> )
ceil ( <value> )
floor ( <value> )
lookup( <in_value>, <vector_of_vectors> )
```

---

### String Functions

```
str(string, value, ...)
```

---

### Primitive Solids

```
cube(size = <value or vector>, center = <boolean>);
sphere(r = <radius>);
cylinder(h = <height>, r1 = <bottomRadius>, r2 = <topRadius>, center = <boolean>);
cylinder(h = <height>, r = <radius>);
polyhedron(points = [[x, y, z], ... ], triangles = [[p1, p2, p3..], ... ], convexity = N);
```

---

### Transformations

```
scale(v = [x, y, z]) { ... }

(In versions > 2013.03)
resize(newsize=[x,y,z], auto=(true|false) { ... }
resize(newsize=[x,y,z], auto=[xaxis,yaxis,zaxis]) { ... } // #axis is true|false
resize([x,y,z],[xaxis,yaxis,zaxis]) { ... }
resize([x,y,z]) { ... }

rotate(a = deg, v = [x, y, z]) { ... }
rotate(a=[x_deg,y_deg,z_deg]) { ... }

translate(v = [x, y, z]) { ... }

mirror([ 0, 1, 0 ]) { ... }

multmatrix(m = [tranformationMatrix]) { ... }

color([r, g, b, a]) { ... }
color([ R/255, G/255, B/255, a]) { ... }
color("blue",a) { ... }
```

---

### Conditional and Iterator Functions

```
for (<loop_variable_name> = <vector> ) {...}
intersection_for (<loop_variable_name> = <vector_of_vectors>) {...}
if (<boolean condition>) {...} else {...}
assign (<var1>= <val1>, <var2>= <val2>, ...) {...}
```

---

### CSG Modelling

```
union() {...}
difference() {...}
intersection() {...}
render(convexity = <value>) { ... }
```

---

### Modifier Characters

```
! { ... } // Ignore the rest of the design and use this subtree as design root
* { ... } // Ignore this subtree
% { ... } // Ignore CSG of this subtree and draw it in transparent gray
# { ... } // Use this subtree as usual but draw it in transparent pink
```

---

### Modules

```
module name(<var1>, <var2>, ...) { ...<module code>...}
```

Variables can be default initialized `<var1>=<defaultvalue>`

In module you can use `children()` to refer to all child nodes, or `children(i)` where `i` is between 0 and `$children`.

---

### Include Statement

**After 2010.02**

```
include <filename.scad>  (appends whole file)
use <filename.scad>      (appends ONLY modules and functions)
```

`filename` could use directory (with `/` char separator).

**Prior to 2010.02**

```
<filename.scad>
```

---

### Other Language Features

- `$fa` is the minimum angle for a fragment. The default value is 12 (degrees).
- `$fs` is the minimum size of a fragment. The default value is 1.
- `$fn` is the number of fragments. The default value is 0.

When `$fa` and `$fs` are used to determine the number of fragments for a circle, then OpenSCAD never uses less than 5 fragments.

**$t**

The `$t` variable is used for animation. If you enable the animation frame with view->animate and give a value for "FPS" and "Steps", the "Time" field shows the current value of `$t`.

```
function name(<var>) = f(<var>);
echo(<string>, <var>, ...);
render(convexity = <val>) {...}
surface(file = "filename.dat", center = <boolean>, convexity = <val>);
```

---

### 2D Primitives

```
square(size = <val>, center=<boolean>);
square(size = [x,y], center=<boolean>);
circle(r = <val>);
polygon(points = [[x, y], ... ], paths = [[p1, p2, p3..], ... ], convexity = N);
```

---

### 3D to 2D Projection

```
projection(cut = <boolean>)
```

---

### 2D to 3D Extrusion

```
linear_extrude(height = <val>, center = <boolean>, convexity = <val>, twist = <degrees>[, slices = <val>, $fn=...,$fs=...,$fa=...]){...}
rotate_extrude(convexity = <val>[, $fn = ...]){...}
```

---

### DXF Extrusion

```
linear_extrude(height = <val>, center = <boolean>, convexity = <val>, twist = <degrees>[...])
import (file = "filename.dxf", layer = "layername")
rotate_extrude(origin = [x,y], convexity = <val>[, $fn = ...])
import (file = "filename.dxf", layer = "layername")
```

---

### STL Import

```
import("filename.stl", convexity = <val>);
```

---

*Retrieved from "https://en.wikibooks.org/w/index.php?title=OpenSCAD_User_Manual/Command_Glossary&oldid=3674803"*

---
---

## Part 3: OpenSCAD CheatSheet

*v2021.01 — By Peter Uithoven @ Fablab Amersfoort (CC-BY)*

*Edit me on GitHub!*

*Links: Official website | Code | Issues | Manual | MCAD library | Mailing list | Other links*

---

### Constants

| Constant | Description |
|----------|-------------|
| `undef` | undefined value |
| `PI` | mathematical constant π (~3.14159) |

---

### Operators

| Operator | Description |
|----------|-------------|
| `n + m` | Addition |
| `n - m` | Subtraction |
| `n * m` | Multiplication |
| `n / m` | Division |
| `n % m` | Modulo |
| `n ^ m` | Exponentiation |
| `n < m` | Less Than |
| `n <= m` | Less or Equal |
| `b == c` | Equal |
| `b != c` | Not Equal |
| `n >= m` | Greater or Equal |
| `n > m` | Greater Than |
| `b && c` | Logical And |
| `b \|\| c` | Logical Or |
| `!b` | Negation |

---

### Special variables

| Variable | Description |
|----------|-------------|
| `$fa` | minimum angle |
| `$fs` | minimum size |
| `$fn` | number of segments |
| `$t` | animation step |
| `$vpr` | viewport rotation angles in degrees |
| `$vpt` | viewport translation |
| `$vpd` | viewport camera distance |
| `$vpf` | viewport camera field of view |
| `$children` | number of module children |
| `$preview` | true in F5 preview, false for F6 |

---

### Syntax

```openscad
var = value;
var = cond ? value_if_true : value_if_false;
var = function (x) x + x;
module name(…) { … }
name();
function name(…) = …
name();
include <….scad>
use <….scad>
```

---

### Modifier Characters

| Character | Description |
|-----------|-------------|
| `*` | disable |
| `!` | show only |
| `#` | highlight / debug |
| `%` | transparent / background |

---

### 2D

```
circle(radius | d=diameter)
square(size,center)
square([width,height],center)
polygon([points])
polygon([points],[paths])
text(t, size, font, direction, language, script,
     halign, valign, spacing)
import("…. ", convexity)
projection(cut)
```

---

### 3D

```
sphere(radius | d=diameter)
cube(size, center)
cube([width,depth,height], center)
cylinder(h,r|d,center)
cylinder(h,r1|d1,r2|d2,center)
polyhedron(points, faces, convexity)
import("…. ", convexity)
linear_extrude(height,center,convexity,twist,slices)
rotate_extrude(angle,convexity)
surface(file = "…. ",center,convexity)
```

---

### Transformations

```
translate([x,y,z])
rotate([x,y,z])
rotate(a, [x,y,z])
scale([x,y,z])
resize([x,y,z],auto,convexity)
mirror([x,y,z])
multmatrix(m)
color("colorname",alpha)
color("#hexvalue")
color([r,g,b,a])
offset(r|delta,chamfer)
hull()
minkowski(convexity)
```

---

### Lists

```
list = […, …, …];        // create a list
var = list[2];            // index a list (from 0)
var = list.z;             // dot notation indexing (x/y/z)
```

---

### Boolean operations

```
union()
difference()
intersection()
```

---

### List Comprehensions

| Syntax | Description |
|--------|-------------|
| `[ for (i = range\|list) i ]` | Generate |
| `[ for (init; condition; next) i ]` | Generate |
| `[ each i ]` | Flatten |
| `[ for (i = …) if (condition(i)) i ]` | Conditions |
| `[ for (i = …) if (condition(i)) x else y ]` | Conditions |
| `[ for (i = …) let (assignments) a ]` | Assignments |

---

### Flow Control

```
for (i = [start:end]) { … }
for (i = [start:step:end]) { … }
for (i = […,…,…]) { … }
for (i = …, j = …, …) { … }
intersection_for(i = [start:end]) { … }
intersection_for(i = [start:step:end]) { … }
intersection_for(i = […,…,…]) { … }
if (…) { … }
let (…) { … }
```

---

### Type test functions

| Function |
|----------|
| `is_undef` |
| `is_bool` |
| `is_num` |
| `is_string` |
| `is_list` |
| `is_function` |

---

### Other

```
echo(…)
render(convexity)
children([idx])
assert(condition, message)
assign (…) { … }
```

---

### Functions

| Function |
|----------|
| `concat` |
| `lookup` |
| `str` |
| `chr` |
| `ord` |
| `search` |
| `version` |
| `version_num` |
| `parent_module(idx)` |

---

### Mathematical

| Function |
|----------|
| `abs` |
| `sign` |
| `sin` |
| `cos` |
| `tan` |
| `acos` |
| `asin` |
| `atan` |
| `atan2` |
| `floor` |
| `round` |
| `ceil` |
| `ln` |
| `len` |
| `let` |
| `log` |
| `pow` |
| `sqrt` |
| `exp` |
| `rands` |
| `min` |
| `max` |
| `norm` |
| `cross` |

