/**
 * The University of Oregon's tactile map symbols as a symbol set: the
 * fourteen point symbols of Lobben and Lawrence 2012 (The Professional
 * Geographer 64(1): 95-108, doi 10.1080/00330124.2011.595619), as modeled
 * for 3D printing by Brittell, Garcia, Lobben and Lawrence (University of
 * Oregon, 2016, doi 10.7264/D37P4V), with their line styles and fills named.
 *
 * Each point symbol is the outline of its OpenSCAD module seen from above,
 * in the library's unit box (0 to 1, y down), at its published size: 13 mm,
 * wider for the two-part symbols, so every 13 mm part stays 13 mm. The
 * published lines are 0.8 mm, under the 1.0 mm a 0.4 mm nozzle prints
 * reliably; here every line is 1.2 mm, the set's own street line. The
 * authors note that any change in a symbol's size should be tested for
 * readability.
 *
 * Which map class takes which symbol is `classSymbols`; null keeps the
 * basic shape, for a class the set has no symbol for.
 *
 * No DOM here: a worker may import this file.
 *
 * Copyright (c) 2013, 2016 University of Oregon; Brittell, Garcia, Lobben,
 * Lawrence (the 3D models, GPL-3.0). Traced into path data for this tool.
 *
 * @license GPL-3.0-or-later
 */

const SYMBOLS = [
  {
    key: 'challenging-feature',
    name: 'Challenging feature',
    meaning: 'A feature of special or particular relevance to the map',
    pathData: 'M 1 0 L 0 0 L 0 1 L 1 1 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the challengingFeature (filled square) module, seen from above',
  },
  {
    key: 'flexible-feature',
    name: 'Flexible feature',
    meaning: 'A general feature of relevance to the map',
    pathData:
      'M 0.5937 0.9911 L 0.6545 0.9755 L 0.7129 0.9524 L 0.7679 0.9222 L 0.8187 0.8853 L 0.8645 0.8423 L 0.9045 0.7939 L 0.9382 0.7409 L 0.9649 0.6841 L 0.9843 0.6243 L 0.9961 0.5627 L 1 0.5 L 0.9961 0.4373 L 0.9843 0.3757 L 0.9649 0.3159 L 0.9382 0.2591 L 0.9045 0.2061 L 0.8645 0.1577 L 0.8187 0.1147 L 0.7679 0.0778 L 0.7129 0.0476 L 0.6545 0.0245 L 0.5937 0.0089 L 0.5314 0.001 L 0.4686 0.001 L 0.4063 0.0089 L 0.3455 0.0245 L 0.2871 0.0476 L 0.2321 0.0778 L 0.1813 0.1147 L 0.1355 0.1577 L 0.0955 0.2061 L 0.0618 0.2591 L 0.0351 0.3159 L 0.0157 0.3757 L 0.0039 0.4373 L 0 0.5 L 0.0039 0.5627 L 0.0157 0.6243 L 0.0351 0.6841 L 0.0618 0.7409 L 0.0955 0.7939 L 0.1355 0.8423 L 0.1813 0.8853 L 0.2321 0.9222 L 0.2871 0.9524 L 0.3455 0.9755 L 0.4063 0.9911 L 0.4686 0.999 L 0.5314 0.999 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the flexibleFeature (filled circle) module, seen from above',
  },
  {
    key: 'elevation-change',
    name: 'Elevation change',
    meaning: 'A change of height, pointing up the slope',
    pathData: 'M 0.5 0.067 L 0 0.933 L 1 0.933 Z',
    minSizeMm: 15.0111,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the filledTriangle (filled triangle) module, seen from above',
  },
  {
    key: 'vegetation',
    name: 'Vegetation',
    meaning: 'Any kind of vegetation',
    pathData:
      'M 0.79 0.9099 L 0.5799 0.5462 L 1 0.5462 L 1 0.4538 L 0.5799 0.4538 L 0.79 0.0901 L 0.71 0.0439 L 0.5 0.4077 L 0.29 0.0439 L 0.21 0.0901 L 0.4201 0.4538 L 0 0.4538 L 0 0.5462 L 0.4201 0.5462 L 0.21 0.9099 L 0.29 0.9561 L 0.5 0.5923 L 0.71 0.9561 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the star (three crossed bars) module, seen from above',
  },
  {
    key: 'intersection',
    name: 'Intersection',
    meaning: 'An intersection with no traffic control',
    pathData:
      'M 0.5937 0.9911 L 0.6545 0.9755 L 0.7129 0.9524 L 0.7679 0.9222 L 0.8187 0.8853 L 0.8645 0.8423 L 0.9045 0.7939 L 0.9382 0.7409 L 0.9649 0.6841 L 0.9843 0.6243 L 0.9961 0.5627 L 1 0.5 L 0.9961 0.4373 L 0.9843 0.3757 L 0.9649 0.3159 L 0.9382 0.2591 L 0.9045 0.2061 L 0.8645 0.1577 L 0.8187 0.1147 L 0.7679 0.0778 L 0.7129 0.0476 L 0.6545 0.0245 L 0.5937 0.0089 L 0.5314 0.001 L 0.4686 0.001 L 0.4063 0.0089 L 0.3455 0.0245 L 0.2871 0.0476 L 0.2321 0.0778 L 0.1813 0.1147 L 0.1355 0.1577 L 0.0955 0.2061 L 0.0618 0.2591 L 0.0351 0.3159 L 0.0157 0.3757 L 0.0039 0.4373 L 0 0.5 L 0.0039 0.5627 L 0.0157 0.6243 L 0.0351 0.6841 L 0.0618 0.7409 L 0.0955 0.7939 L 0.1355 0.8423 L 0.1813 0.8853 L 0.2321 0.9222 L 0.2871 0.9524 L 0.3455 0.9755 L 0.4063 0.9911 L 0.4686 0.999 L 0.5314 0.999 Z M 0.4744 0.9069 L 0.4236 0.9005 L 0.374 0.8877 L 0.3264 0.8689 L 0.2815 0.8442 L 0.2401 0.8141 L 0.2028 0.7791 L 0.1702 0.7396 L 0.1427 0.6964 L 0.1209 0.6501 L 0.1051 0.6014 L 0.0955 0.5511 L 0.0923 0.5 L 0.0955 0.4489 L 0.1051 0.3986 L 0.1209 0.3499 L 0.1427 0.3036 L 0.1702 0.2604 L 0.2028 0.2209 L 0.2401 0.1859 L 0.2815 0.1558 L 0.3264 0.1311 L 0.374 0.1123 L 0.4236 0.0995 L 0.4744 0.0931 L 0.5256 0.0931 L 0.5764 0.0995 L 0.626 0.1123 L 0.6736 0.1311 L 0.7185 0.1558 L 0.7599 0.1859 L 0.7972 0.2209 L 0.8298 0.2604 L 0.8573 0.3036 L 0.8791 0.3499 L 0.8949 0.3986 L 0.9045 0.4489 L 0.9077 0.5 L 0.9045 0.5511 L 0.8949 0.6014 L 0.8791 0.6501 L 0.8573 0.6964 L 0.8298 0.7396 L 0.7972 0.7791 L 0.7599 0.8141 L 0.7185 0.8442 L 0.6736 0.8689 L 0.626 0.8877 L 0.5764 0.9005 L 0.5256 0.9069 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the intersection (open circle) module, seen from above',
  },
  {
    key: 'intersection-across',
    name: 'Intersection, controlled across',
    meaning: 'An intersection controlled one way, across',
    pathData:
      'M 0.5937 0.9911 L 0.6545 0.9755 L 0.7129 0.9524 L 0.7679 0.9222 L 0.8187 0.8853 L 0.8645 0.8423 L 0.9045 0.7939 L 0.9382 0.7409 L 0.9649 0.6841 L 0.9843 0.6243 L 0.9961 0.5627 L 1 0.5 L 0.9961 0.4373 L 0.9843 0.3757 L 0.9649 0.3159 L 0.9382 0.2591 L 0.9045 0.2061 L 0.8645 0.1577 L 0.8187 0.1147 L 0.7679 0.0778 L 0.7129 0.0476 L 0.6545 0.0245 L 0.5937 0.0089 L 0.5314 0.001 L 0.4686 0.001 L 0.4063 0.0089 L 0.3455 0.0245 L 0.2871 0.0476 L 0.2321 0.0778 L 0.1813 0.1147 L 0.1355 0.1577 L 0.0955 0.2061 L 0.0618 0.2591 L 0.0351 0.3159 L 0.0157 0.3757 L 0.0039 0.4373 L 0 0.5 L 0.0039 0.5627 L 0.0157 0.6243 L 0.0351 0.6841 L 0.0618 0.7409 L 0.0955 0.7939 L 0.1355 0.8423 L 0.1813 0.8853 L 0.2321 0.9222 L 0.2871 0.9524 L 0.3455 0.9755 L 0.4063 0.9911 L 0.4686 0.999 L 0.5314 0.999 Z M 0.0952 0.4538 L 0.0955 0.4489 L 0.1051 0.3986 L 0.1209 0.3499 L 0.1427 0.3036 L 0.1702 0.2604 L 0.2028 0.2209 L 0.2401 0.1859 L 0.2815 0.1558 L 0.3264 0.1311 L 0.374 0.1123 L 0.4236 0.0995 L 0.4744 0.0931 L 0.5256 0.0931 L 0.5764 0.0995 L 0.626 0.1123 L 0.6736 0.1311 L 0.7185 0.1558 L 0.7599 0.1859 L 0.7972 0.2209 L 0.8298 0.2604 L 0.8573 0.3036 L 0.8791 0.3499 L 0.8949 0.3986 L 0.9045 0.4489 L 0.9048 0.4538 Z M 0.4744 0.9069 L 0.4236 0.9005 L 0.374 0.8877 L 0.3264 0.8689 L 0.2815 0.8442 L 0.2401 0.8141 L 0.2028 0.7791 L 0.1702 0.7396 L 0.1427 0.6964 L 0.1209 0.6501 L 0.1051 0.6014 L 0.0955 0.5511 L 0.0952 0.5462 L 0.9048 0.5462 L 0.9045 0.5511 L 0.8949 0.6014 L 0.8791 0.6501 L 0.8573 0.6964 L 0.8298 0.7396 L 0.7972 0.7791 L 0.7599 0.8141 L 0.7185 0.8442 L 0.6736 0.8689 L 0.626 0.8877 L 0.5764 0.9005 L 0.5256 0.9069 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the intersection with a line across module, seen from above',
  },
  {
    key: 'intersection-along',
    name: 'Intersection, controlled along',
    meaning: 'An intersection controlled one way, along',
    pathData:
      'M 0.5937 0.9911 L 0.6545 0.9755 L 0.7129 0.9524 L 0.7679 0.9222 L 0.8187 0.8853 L 0.8645 0.8423 L 0.9045 0.7939 L 0.9382 0.7409 L 0.9649 0.6841 L 0.9843 0.6243 L 0.9961 0.5627 L 1 0.5 L 0.9961 0.4373 L 0.9843 0.3757 L 0.9649 0.3159 L 0.9382 0.2591 L 0.9045 0.2061 L 0.8645 0.1577 L 0.8187 0.1147 L 0.7679 0.0778 L 0.7129 0.0476 L 0.6545 0.0245 L 0.5937 0.0089 L 0.5314 0.001 L 0.4686 0.001 L 0.4063 0.0089 L 0.3455 0.0245 L 0.2871 0.0476 L 0.2321 0.0778 L 0.1813 0.1147 L 0.1355 0.1577 L 0.0955 0.2061 L 0.0618 0.2591 L 0.0351 0.3159 L 0.0157 0.3757 L 0.0039 0.4373 L 0 0.5 L 0.0039 0.5627 L 0.0157 0.6243 L 0.0351 0.6841 L 0.0618 0.7409 L 0.0955 0.7939 L 0.1355 0.8423 L 0.1813 0.8853 L 0.2321 0.9222 L 0.2871 0.9524 L 0.3455 0.9755 L 0.4063 0.9911 L 0.4686 0.999 L 0.5314 0.999 Z M 0.4236 0.9005 L 0.374 0.8877 L 0.3264 0.8689 L 0.2815 0.8442 L 0.2401 0.8141 L 0.2028 0.7791 L 0.1702 0.7396 L 0.1427 0.6964 L 0.1209 0.6501 L 0.1051 0.6014 L 0.0955 0.5511 L 0.0923 0.5 L 0.0955 0.4489 L 0.1051 0.3986 L 0.1209 0.3499 L 0.1427 0.3036 L 0.1702 0.2604 L 0.2028 0.2209 L 0.2401 0.1859 L 0.2815 0.1558 L 0.3264 0.1311 L 0.374 0.1123 L 0.4236 0.0995 L 0.4538 0.0957 L 0.4538 0.9043 Z M 0.5462 0.0957 L 0.5764 0.0995 L 0.626 0.1123 L 0.6736 0.1311 L 0.7185 0.1558 L 0.7599 0.1859 L 0.7972 0.2209 L 0.8298 0.2604 L 0.8573 0.3036 L 0.8791 0.3499 L 0.8949 0.3986 L 0.9045 0.4489 L 0.9077 0.5 L 0.9045 0.5511 L 0.8949 0.6014 L 0.8791 0.6501 L 0.8573 0.6964 L 0.8298 0.7396 L 0.7972 0.7791 L 0.7599 0.8141 L 0.7185 0.8442 L 0.6736 0.8689 L 0.626 0.8877 L 0.5764 0.9005 L 0.5462 0.9043 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the intersection with a line along module, seen from above',
  },
  {
    key: 'intersection-both',
    name: 'Intersection, controlled both ways',
    meaning: 'An intersection controlled both ways',
    pathData:
      'M 0.5937 0.9911 L 0.6545 0.9755 L 0.7129 0.9524 L 0.7679 0.9222 L 0.8187 0.8853 L 0.8645 0.8423 L 0.9045 0.7939 L 0.9382 0.7409 L 0.9649 0.6841 L 0.9843 0.6243 L 0.9961 0.5627 L 1 0.5 L 0.9961 0.4373 L 0.9843 0.3757 L 0.9649 0.3159 L 0.9382 0.2591 L 0.9045 0.2061 L 0.8645 0.1577 L 0.8187 0.1147 L 0.7679 0.0778 L 0.7129 0.0476 L 0.6545 0.0245 L 0.5937 0.0089 L 0.5314 0.001 L 0.4686 0.001 L 0.4063 0.0089 L 0.3455 0.0245 L 0.2871 0.0476 L 0.2321 0.0778 L 0.1813 0.1147 L 0.1355 0.1577 L 0.0955 0.2061 L 0.0618 0.2591 L 0.0351 0.3159 L 0.0157 0.3757 L 0.0039 0.4373 L 0 0.5 L 0.0039 0.5627 L 0.0157 0.6243 L 0.0351 0.6841 L 0.0618 0.7409 L 0.0955 0.7939 L 0.1355 0.8423 L 0.1813 0.8853 L 0.2321 0.9222 L 0.2871 0.9524 L 0.3455 0.9755 L 0.4063 0.9911 L 0.4686 0.999 L 0.5314 0.999 Z M 0.0952 0.4538 L 0.0955 0.4489 L 0.1051 0.3986 L 0.1209 0.3499 L 0.1427 0.3036 L 0.1702 0.2604 L 0.2028 0.2209 L 0.2401 0.1859 L 0.2815 0.1558 L 0.3264 0.1311 L 0.374 0.1123 L 0.4236 0.0995 L 0.4538 0.0957 L 0.4538 0.4538 Z M 0.5462 0.4538 L 0.5462 0.0957 L 0.5764 0.0995 L 0.626 0.1123 L 0.6736 0.1311 L 0.7185 0.1558 L 0.7599 0.1859 L 0.7972 0.2209 L 0.8298 0.2604 L 0.8573 0.3036 L 0.8791 0.3499 L 0.8949 0.3986 L 0.9045 0.4489 L 0.9048 0.4538 Z M 0.4236 0.9005 L 0.374 0.8877 L 0.3264 0.8689 L 0.2815 0.8442 L 0.2401 0.8141 L 0.2028 0.7791 L 0.1702 0.7396 L 0.1427 0.6964 L 0.1209 0.6501 L 0.1051 0.6014 L 0.0955 0.5511 L 0.0952 0.5462 L 0.4538 0.5462 L 0.4538 0.9043 Z M 0.5462 0.5462 L 0.9048 0.5462 L 0.9045 0.5511 L 0.8949 0.6014 L 0.8791 0.6501 L 0.8573 0.6964 L 0.8298 0.7396 L 0.7972 0.7791 L 0.7599 0.8141 L 0.7185 0.8442 L 0.6736 0.8689 L 0.626 0.8877 L 0.5764 0.9005 L 0.5462 0.9043 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the intersection with two lines module, seen from above',
  },
  {
    key: 'entrance',
    name: 'Entrance',
    meaning: 'An entrance, the open side the way in',
    pathData:
      'M 0.0923 0.0923 L 0.9077 0.0923 L 0.9077 1 L 1 1 L 1 0 L 0 0 L 0 1 L 0.0923 1 Z',
    minSizeMm: 13,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the entrance (three-sided square) module, seen from above',
  },
  {
    key: 'entrance-up',
    name: 'Entrance with stairs or ramp up',
    meaning: 'An entrance up stairs or a ramp',
    pathData:
      'M 0.236 0.2956 L 0 0.7044 L 0.472 0.7044 Z M 0.629 0.3334 L 0.9623 0.3334 L 0.9623 0.7044 L 1 0.7044 L 1 0.2956 L 0.5913 0.2956 L 0.5913 0.7044 L 0.629 0.7044 Z',
    minSizeMm: 31.8056,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the entranceRamp, triangle up module, seen from above',
  },
  {
    key: 'entrance-down',
    name: 'Entrance with stairs or ramp down',
    meaning: 'An entrance down stairs or a ramp',
    pathData:
      'M 0.472 0.2956 L 0 0.2956 L 0.236 0.7044 Z M 0.629 0.3334 L 0.9623 0.3334 L 0.9623 0.7044 L 1 0.7044 L 1 0.2956 L 0.5913 0.2956 L 0.5913 0.7044 L 0.629 0.7044 Z',
    minSizeMm: 31.8056,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the entranceRamp, triangle down module, seen from above',
  },
  {
    key: 'passageway',
    name: 'Passageway',
    meaning: 'A way through',
    pathData:
      'M 0.1712 0.9364 L 0.2922 0.8877 L 0.398 0.8329 L 0.4869 0.7729 L 0.5576 0.7085 L 0.6089 0.6409 L 0.64 0.571 L 0.6504 0.5 L 0.64 0.429 L 0.6089 0.3591 L 0.5576 0.2915 L 0.4869 0.2271 L 0.398 0.1671 L 0.2922 0.1123 L 0.1712 0.0636 L 0.1256 0.0494 L 0.0718 0.0841 L 0.0218 0.1208 L 0 0.1393 L 0.0157 0.1442 L 0.1143 0.1839 L 0.2006 0.2285 L 0.2731 0.2775 L 0.3307 0.33 L 0.3725 0.3851 L 0.3979 0.4421 L 0.4064 0.5 L 0.3979 0.5579 L 0.3725 0.6149 L 0.3307 0.67 L 0.2731 0.7225 L 0.2006 0.7715 L 0.1143 0.8161 L 0.0157 0.8558 L 0 0.8607 L 0.0218 0.8792 L 0.0718 0.9159 L 0.1256 0.9506 Z M 0.5208 0.9364 L 0.6418 0.8877 L 0.7476 0.8329 L 0.8365 0.7729 L 0.9072 0.7085 L 0.9585 0.6409 L 0.9896 0.571 L 1 0.5 L 0.9896 0.429 L 0.9585 0.3591 L 0.9072 0.2915 L 0.8365 0.2271 L 0.7476 0.1671 L 0.6418 0.1123 L 0.5208 0.0636 L 0.4752 0.0494 L 0.4214 0.0841 L 0.3714 0.1208 L 0.3496 0.1393 L 0.3653 0.1442 L 0.464 0.1839 L 0.5502 0.2285 L 0.6227 0.2775 L 0.6803 0.33 L 0.7222 0.3851 L 0.7475 0.4421 L 0.756 0.5 L 0.7475 0.5579 L 0.7222 0.6149 L 0.6803 0.67 L 0.6227 0.7225 L 0.5502 0.7715 L 0.464 0.8161 L 0.3653 0.8558 L 0.3496 0.8607 L 0.3714 0.8792 L 0.4214 0.9159 L 0.4752 0.9506 Z',
    minSizeMm: 13.7715,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the passageway (double curve) module, seen from above',
  },
  {
    key: 'overpass',
    name: 'Overpass or bridge',
    meaning: 'A way over',
    pathData:
      'M 0.2445 0.2883 L 0 0.7117 L 0.489 0.7117 Z M 0.6282 0.6958 L 0.6825 0.6739 L 0.7299 0.6493 L 0.7698 0.6224 L 0.8015 0.5935 L 0.8245 0.5632 L 0.8385 0.5318 L 0.8432 0.5 L 0.8385 0.4682 L 0.8245 0.4368 L 0.8015 0.4065 L 0.7698 0.3776 L 0.7299 0.3507 L 0.6825 0.3261 L 0.6282 0.3042 L 0.6077 0.2979 L 0.5836 0.3134 L 0.5612 0.3299 L 0.5514 0.3382 L 0.5584 0.3404 L 0.6027 0.3582 L 0.6414 0.3782 L 0.6739 0.4002 L 0.6998 0.4237 L 0.7185 0.4485 L 0.7299 0.474 L 0.7337 0.5 L 0.7299 0.526 L 0.7185 0.5515 L 0.6998 0.5763 L 0.6739 0.5998 L 0.6414 0.6218 L 0.6027 0.6418 L 0.5584 0.6596 L 0.5514 0.6618 L 0.5612 0.6701 L 0.5836 0.6866 L 0.6077 0.7021 Z M 0.785 0.6958 L 0.8393 0.6739 L 0.8868 0.6493 L 0.9267 0.6224 L 0.9584 0.5935 L 0.9814 0.5632 L 0.9953 0.5318 L 1 0.5 L 0.9953 0.4682 L 0.9814 0.4368 L 0.9584 0.4065 L 0.9267 0.3776 L 0.8868 0.3507 L 0.8393 0.3261 L 0.785 0.3042 L 0.7646 0.2979 L 0.7404 0.3134 L 0.718 0.3299 L 0.7082 0.3382 L 0.7153 0.3404 L 0.7595 0.3582 L 0.7982 0.3782 L 0.8308 0.4002 L 0.8566 0.4237 L 0.8754 0.4485 L 0.8867 0.474 L 0.8905 0.5 L 0.8867 0.526 L 0.8754 0.5515 L 0.8566 0.5763 L 0.8308 0.5998 L 0.7982 0.6218 L 0.7595 0.6418 L 0.7153 0.6596 L 0.7082 0.6618 L 0.718 0.6701 L 0.7404 0.6866 L 0.7646 0.7021 Z',
    minSizeMm: 30.6982,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the passagewayRamp, triangle up module, seen from above',
  },
  {
    key: 'underpass',
    name: 'Underpass or tunnel',
    meaning: 'A way under',
    pathData:
      'M 0.489 0.2883 L 0 0.2883 L 0.2445 0.7117 Z M 0.6282 0.6958 L 0.6825 0.6739 L 0.7299 0.6493 L 0.7698 0.6224 L 0.8015 0.5935 L 0.8245 0.5632 L 0.8385 0.5318 L 0.8432 0.5 L 0.8385 0.4682 L 0.8245 0.4368 L 0.8015 0.4065 L 0.7698 0.3776 L 0.7299 0.3507 L 0.6825 0.3261 L 0.6282 0.3042 L 0.6077 0.2979 L 0.5836 0.3134 L 0.5612 0.3299 L 0.5514 0.3382 L 0.5584 0.3404 L 0.6027 0.3582 L 0.6414 0.3782 L 0.6739 0.4002 L 0.6998 0.4237 L 0.7185 0.4485 L 0.7299 0.474 L 0.7337 0.5 L 0.7299 0.526 L 0.7185 0.5515 L 0.6998 0.5763 L 0.6739 0.5998 L 0.6414 0.6218 L 0.6027 0.6418 L 0.5584 0.6596 L 0.5514 0.6618 L 0.5612 0.6701 L 0.5836 0.6866 L 0.6077 0.7021 Z M 0.785 0.6958 L 0.8393 0.6739 L 0.8868 0.6493 L 0.9267 0.6224 L 0.9584 0.5935 L 0.9814 0.5632 L 0.9953 0.5318 L 1 0.5 L 0.9953 0.4682 L 0.9814 0.4368 L 0.9584 0.4065 L 0.9267 0.3776 L 0.8868 0.3507 L 0.8393 0.3261 L 0.785 0.3042 L 0.7646 0.2979 L 0.7404 0.3134 L 0.718 0.3299 L 0.7082 0.3382 L 0.7153 0.3404 L 0.7595 0.3582 L 0.7982 0.3782 L 0.8308 0.4002 L 0.8566 0.4237 L 0.8754 0.4485 L 0.8867 0.474 L 0.8905 0.5 L 0.8867 0.526 L 0.8754 0.5515 L 0.8566 0.5763 L 0.8308 0.5998 L 0.7982 0.6218 L 0.7595 0.6418 L 0.7153 0.6596 L 0.7082 0.6618 L 0.718 0.6701 L 0.7404 0.6866 L 0.7646 0.7021 Z',
    minSizeMm: 30.6982,
    source:
      'Lobben and Lawrence 2012, The Professional Geographer 64(1): 95-108; modeled for 3D printing by Brittell, Garcia, Lobben and Lawrence 2016, University of Oregon, GPL-3: the passagewayRamp, triangle down module, seen from above',
  },
];

/**
 * The set's line symbols. `class` is the map class that draws with it, and
 * `style` and the sizes are how the levels builder draws it; a line symbol
 * no class uses is named, not drawn.
 */
const LINE_STYLES = [
  {
    key: 'street',
    name: 'Street',
    meaning: 'A street: a plain line',
    class: 'curb',
    style: 'solid',
    widthMm: 1.2,
  },
  {
    key: 'railroad',
    name: 'Railroad',
    meaning: 'A railroad: two lines 5 mm apart',
    class: 'track',
    style: 'double',
    widthMm: 1.2,
    gapMm: 3.8,
  },
  {
    key: 'sidewalk',
    name: 'Sidewalk',
    meaning: 'A sidewalk: short dashes along it',
    class: 'walkway',
    style: 'dashed',
    widthMm: 1.2,
    dashMm: 2.93,
    dashGapMm: 5.87,
  },
  {
    key: 'fence',
    name: 'Fence',
    meaning: 'A fence: short bars across the line',
    class: null,
  },
  {
    key: 'one-way',
    name: 'One-way street',
    meaning: 'A one-way street: triangles along the line',
    class: null,
  },
  {
    key: 'two-way',
    name: 'Two-way street',
    meaning: 'A two-way street: triangles both ways',
    class: null,
  },
  {
    key: 'sidewalk-stairs',
    name: 'Sidewalk with stairs or ramp',
    meaning: 'Stairs or a ramp on a sidewalk: triangles in the dashes',
    class: null,
  },
  {
    key: 'water',
    name: 'Water',
    meaning: 'Water: a wavy line',
    class: null,
  },
];

/** The set's area fills; named only, the builder draws areas plain. */
const FILLS = [
  { key: 'solid', name: 'Solid fill' },
  { key: 'hatch', name: 'Hatch' },
  { key: 'points', name: 'Points' },
  { key: 'dots', name: 'Dots' },
  { key: 'diamonds', name: 'Diamonds' },
  { key: 'circles', name: 'Circles' },
];

export const OREGON_2012 = Object.freeze({
  key: 'oregon-2012',
  name: 'University of Oregon symbols',
  credit: 'Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3',
  symbolSizeMm: 13,
  lineMm: 1.2,
  publishedLineMm: 0.8,
  symbols: SYMBOLS,
  classSymbols: {
    entrance: 'entrance',
    stairs: 'elevation-change',
    crossing: 'intersection',
    landmark: 'flexible-feature',
    'transit-stop': 'challenging-feature',
    furniture: null,
    'curb-ramp': null,
    'raised-curb': null,
    'elevator-up': null,
    'elevator-down': null,
    'you-are-here': null,
  },
  lineStyles: LINE_STYLES,
  fills: FILLS,
});
