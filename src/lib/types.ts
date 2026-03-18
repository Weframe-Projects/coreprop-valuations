// ============================================================
// CoreProp Valuation Report - Type Definitions
// ============================================================

// --- Report Types ---

export type ReportType =
  | 'iht_inspected'
  | 'iht_desktop'
  | 'current_market_inspected'
  | 'current_market_desktop'
  | 'auction_inspected'
  | 'auction_desktop'
  | 'ha_current_market_auction'
  | 'aso_inspected'
  | 'aso_desktop'
  | 'portfolio_inspected'
  | 'portfolio_desktop';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  iht_inspected: 'IHT - Inspected',
  iht_desktop: 'IHT - Desktop',
  current_market_inspected: 'Current Market - Inspected',
  current_market_desktop: 'Current Market - Desktop',
  auction_inspected: 'Auction - Inspected',
  auction_desktop: 'Auction - Desktop',
  ha_current_market_auction: 'HA Current Market & Auction',
  aso_inspected: 'Shared Ownership - Inspected',
  aso_desktop: 'Shared Ownership - Desktop',
  portfolio_inspected: 'Portfolio - Inspected',
  portfolio_desktop: 'Portfolio - Desktop',
};

export function isInspectedType(type: ReportType): boolean {
  return type === 'iht_inspected'
    || type === 'current_market_inspected'
    || type === 'auction_inspected'
    || type === 'ha_current_market_auction'
    || type === 'aso_inspected'
    || type === 'portfolio_inspected';
}

export function isDesktopType(type: ReportType): boolean {
  return !isInspectedType(type);
}

export function isIHTType(type: ReportType): boolean {
  return type === 'iht_inspected' || type === 'iht_desktop';
}

export function isAuctionType(type: ReportType): boolean {
  return type === 'auction_inspected'
    || type === 'auction_desktop'
    || type === 'ha_current_market_auction';
}

export function isASOType(type: ReportType): boolean {
  return type === 'aso_inspected' || type === 'aso_desktop';
}

export function isPortfolioType(type: ReportType): boolean {
  return type === 'portfolio_inspected' || type === 'portfolio_desktop';
}

// --- Property Types ---

export type PropertyType =
  | 'detached_house'
  | 'semi_detached_house'
  | 'terraced_house'
  | 'end_terrace_house'
  | 'flat'
  | 'maisonette'
  | 'bungalow'
  | 'other';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  detached_house: 'Detached House',
  semi_detached_house: 'Semi-Detached House',
  terraced_house: 'Terraced House',
  end_terrace_house: 'End of Terrace House',
  flat: 'Flat',
  maisonette: 'Maisonette',
  bungalow: 'Bungalow',
  other: 'Other',
};

// --- Tenure ---

export type Tenure = 'freehold' | 'leasehold';

export type FreeholdSubType =
  | 'standard'
  | 'flying_freehold'
  | 'share_of_freehold'
  | 'commonhold';

export const FREEHOLD_SUBTYPE_LABELS: Record<FreeholdSubType, string> = {
  standard: 'Standard Freehold',
  flying_freehold: 'Flying Freehold',
  share_of_freehold: 'Share of Freehold',
  commonhold: 'Commonhold',
};

export type LeaseholdSubType =
  | 'long_leasehold'
  | 'short_leasehold'
  | 'virtual_freehold';

export const LEASEHOLD_SUBTYPE_LABELS: Record<LeaseholdSubType, string> = {
  long_leasehold: 'Long Leasehold (80+ years)',
  short_leasehold: 'Short Leasehold (<80 years)',
  virtual_freehold: 'Virtual Freehold (999 years)',
};

export interface LeaseholdDetails {
  originalTerm: number | null;     // years (e.g., 125)
  remainingTerm: number | null;    // years unexpired
  leaseStartYear: string;          // e.g., "1985"
  groundRent: number | null;       // annual £
  groundRentReview: string;        // e.g., "fixed", "doubling every 25 years"
  serviceCharge: number | null;    // annual £
}

// --- Condition Ratings ---

export type ConditionRating = 'poor' | 'dated' | 'serviceable' | 'fair' | 'good' | 'modern';

export const CONDITION_LABELS: Record<ConditionRating, string> = {
  poor: 'Poor',
  dated: 'Dated',
  serviceable: 'Serviceable',
  fair: 'Fair',
  good: 'Good',
  modern: 'Modern',
};

// --- EPC Data ---

export interface EPCData {
  address: string;
  postcode: string;
  lodgementDate: string;
  currentEnergyRating: string; // A-G
  currentEnergyEfficiency: number;
  propertyType: string;
  builtForm: string;
  floorArea: number; // m²
  numberOfRooms: number;
  constructionAgeBand: string;
  wallsDescription: string;
  roofDescription: string;
  windowsDescription: string;
  mainHeatingDescription: string;
  floorDescription: string;
  transactionType: string;
  tenure: string;
  environmentImpactCurrent: number;
  lmkKey: string;
}

// --- Land Registry Data ---

export interface LandRegistrySale {
  address: string;
  street: string;
  postcode: string;
  paon: string; // Primary addressable object name (house number)
  saon: string; // Secondary addressable object name (flat number)
  locality: string;
  town: string;
  district: string;
  county: string;
  price: number;
  date: string; // ISO date
  propertyType: 'D' | 'S' | 'T' | 'F' | 'O'; // Detached, Semi, Terraced, Flat, Other
  newBuild: boolean;
  tenure: 'F' | 'L'; // Freehold, Leasehold
  transactionCategory: 'A' | 'B'; // Standard, Additional
}

export const LR_PROPERTY_TYPE_MAP: Record<string, string> = {
  D: 'Detached',
  S: 'Semi-Detached',
  T: 'Terraced',
  F: 'Flat/Maisonette',
  O: 'Other',
};

// --- Comparable ---

export interface Comparable {
  id: string;
  address: string;
  saleDate: string;
  salePrice: number;
  floorArea: number | null; // m², from EPC
  pricePerSqm: number | null;
  propertyType: string;
  bedrooms: number | null;
  description: string; // e.g., "3-bed semi-detached house in dated order"
  source: 'land_registry' | 'auction' | 'historical' | 'rightmove' | 'manual';
  epcRating: string | null;
  floorAreaSource: 'epc' | 'agent_floorplan' | 'estimated' | null;
  distanceMeters: number | null;
  relevanceScore: number; // 0-100
  isSelected: boolean;
  status: 'SOLD' | 'SOLD STC' | 'LISTED';
  agentName: string | null;
  // Enhanced fields
  condition: string | null;
  parking: string | null;
  garden: string | null;
  frontPhotoUrl: string | null;
  floorPlanUrl: string | null;
  tenure: 'freehold' | 'leasehold' | null;
  adjustmentNotes?: string;
}

// --- Google Maps Data ---

export interface NearbyPlace {
  name: string;
  type: 'train_station' | 'hospital' | 'primary_school' | 'secondary_school' | 'school' | 'park' | 'supermarket' | 'doctor';
  distanceText: string; // "0.9 miles"
  distanceValue: number; // meters
  travelMode: 'walking' | 'driving';
}

export interface GoogleMapsData {
  streetViewUrl: string | null;
  satelliteUrl: string | null;
  locationMapUrl: string | null;
  lat: number;
  lng: number;
  nearbyPlaces: NearbyPlace[];
  formattedAddress: string;
  localAuthority: string | null;
}

// --- Structured Inspection Notes (compliance notes taken on-site) ---

export interface StructuredInspectionNotes {
  inspectionDate: string | null;
  inspectorInitials: string;
  timeOfDay: 'morning' | 'afternoon';
  weatherConditions: string;
  descriptionNotes: string;       // Description of property
  constructionNotes: string;      // Type of bricks/materials, roof, stories
  amenitiesNotes: string;         // Off street parking, garage, garden
  layoutNotes: string;            // Ground floor, first floor etc - room descriptions
  heatingNotes: string;           // Heating type and condition
  windowsNotes: string;           // Window type and condition
  gardenNotes: string;            // Garden description
  sizingNotes: string;            // Room measurements
  conditionNotes: string;         // Overall condition assessment
  extraNotes: string;             // Any additional notes
}

export const EMPTY_INSPECTION_NOTES: StructuredInspectionNotes = {
  inspectionDate: null,
  inspectorInitials: '',
  timeOfDay: 'morning',
  weatherConditions: '',
  descriptionNotes: '',
  constructionNotes: '',
  amenitiesNotes: '',
  layoutNotes: '',
  heatingNotes: '',
  windowsNotes: '',
  gardenNotes: '',
  sizingNotes: '',
  conditionNotes: '',
  extraNotes: '',
};

// --- Inspection Data (structured form — legacy, used in report generation) ---

export interface InspectionData {
  inspectionDate: string | null;
  weatherConditions: string;
  kitchenCondition: ConditionRating;
  kitchenNotes: string;
  bathroomCondition: ConditionRating;
  bathroomNotes: string;
  heatingType: string; // e.g., "gas fired boiler"
  heatingMake: string; // e.g., "Vaillant combination"
  heatingCondition: ConditionRating;
  flooringCondition: ConditionRating;
  flooringNotes: string;
  electricalCondition: 'needs_upgrading' | 'slightly_dated' | 'fair' | 'modern';
  windowType: string; // e.g., "uPVC framed double glazed"
  windowCondition: ConditionRating;
  decorativeCondition: ConditionRating;
  decorativeNotes: string;
  overallCondition: ConditionRating;
  overallNotes: string;
  // Structure & External
  rainwaterGoodsCondition: string;
  externalPaintCondition: string;
  roofCondition: string;
  roofNotes: string;
}

// --- Property Details ---

export interface PropertyDetails {
  propertyType: PropertyType;
  storeys: number;
  constructionEra: string; // e.g., "mid- to late-20th century"
  brickType: string; // e.g., "brown brickwork laid in stretcher bond"
  roofType: string; // e.g., "dual-pitched, interlocking concrete tile roof"
  subFlooring: string; // e.g., "timber"
  areaCharacter: string; // e.g., "populated residential area, close to local amenities"
  locationNotes: string; // e.g., "set on a cul-de-sac"
  // Accommodation
  groundFloorRooms: string; // e.g., "Entrance Porch, Hallway, Kitchen/Diner, Living Room"
  firstFloorRooms: string; // e.g., "Landing, 3 Bedrooms, Bathroom"
  secondFloorRooms: string; // optional
  // Externally
  frontDescription: string;
  parkingDescription: string;
  garageType: 'none' | 'single_detached' | 'single_integrated' | 'double' | 'other';
  rearGardenDescription: string;
  // Services
  hasWater: boolean;
  hasGas: boolean;
  hasElectricity: boolean;
  hasDrainage: boolean;
  epcRating: string;
  // Floor area
  floorArea: number; // m²
  floorAreaBasis: string; // e.g., "Gross Internal Area"
  // Tenure
  tenure: Tenure;
  freeholdSubType: FreeholdSubType;
  leaseholdSubType: LeaseholdSubType;
  leaseholdDetails: LeaseholdDetails;
  tenureNotes: string; // e.g., additional details
  // Roads
  roadName: string;
  roadAdopted: boolean;
}

// --- Client & Instruction Details ---

export interface ClientDetails {
  referenceNumber: string;
  clientName: string; // e.g., solicitor or executor name/address
  deceasedName: string; // IHT only
  dateOfDeath: string; // IHT only
  valuationDate: string;
  auctionCompany: string; // Auction types only
}

// --- Full Report ---

export interface ValuationReport {
  id: string;
  reportType: ReportType;
  status: 'draft' | 'review' | 'final';
  clientDetails: ClientDetails;
  propertyAddress: string;
  postcode: string;
  localAuthority: string;
  postalDistrict: string;
  landRegistryTitle: string;
  propertyDetails: PropertyDetails;
  inspectionData: InspectionData | null;
  comparables: Comparable[];
  googleMapsData: GoogleMapsData | null;
  epcData: EPCData | null;
  // Generated text for each section (editable by user)
  generatedSections: Record<string, string>;
  // Final figures
  valuationFigure: number | null;
  valuationFigureWords: string; // e.g., "Five Hundred Thousand Pounds"
  auctionReserve: number | null;
  auctionReserveWords: string;
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// --- User Settings ---

export interface UserSettings {
  id: string;
  userId: string;
  marketCommentaryIht: string;
  marketCommentaryNonIht: string;
  firmName: string;
  signatoryName: string;
  signatoryTitleIht: string;
  signatoryTitleOther: string;
  firmRicsNumber: string;
  firmEmail: string;
  firmPhone: string;
  termsAndConditions: string;
}

// --- Database Report Row ---

export interface ReportRow {
  id: string;
  user_id: string;
  status: 'draft' | 'review' | 'final';
  report_type: ReportType;
  property_address: string;
  postcode: string;
  reference_number: string;
  client_details: Partial<ClientDetails>;
  epc_data: EPCData | null;
  google_maps_data: GoogleMapsData | null;
  property_details: Partial<PropertyDetails>;
  inspection_data: Partial<InspectionData> | null;
  comparables: Comparable[];
  generated_sections: Record<string, string>;
  valuation_figure: number | null;
  valuation_figure_words: string;
  auction_reserve: number | null;
  auction_reserve_words: string;
  local_authority: string | null;
  postal_district: string | null;
  land_registry_title: string;
  // New columns (v2) — optional, may not exist if migration hasn't been run
  title_number?: string;
  google_drive_folder_id?: string | null;
  planning_data?: Record<string, unknown> | null;
  conservation_area?: boolean | null;
  listed_building_grade?: string | null;
  radon_risk?: string | null;
  flood_risk_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// --- Auction Comparable (from scraped auction sites) ---

export interface AuctionComparable {
  id: string;
  source: 'savills' | 'allsop' | 'barnard_marcus' | 'auction_house_london';
  address: string;
  postcode: string;
  salePrice: number | null;
  saleDate: string | null;
  propertyType: string | null;
  lotNumber: string | null;
  auctionDate: string | null;
  bedrooms: number | null;
  description: string;
  imageUrl: string | null;
  url: string;
  lat: number | null;
  lng: number | null;
}

// --- Historical Valuation (uploaded past reports) ---

export interface HistoricalValuation {
  id: string;
  userId: string;
  propertyAddress: string;
  postcode: string;
  valuationFigure: number | null;
  valuationDate: string | null;
  reportType: string | null;
  propertyType: string | null;
  floorArea: number | null;
  bedrooms: number | null;
  notes: string;
  storagePath: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

// --- UI Report Types (5 user-facing types matching client examples) ---

export const UI_REPORT_TYPES: { value: ReportType; label: string; group: string }[] = [
  // Current Market
  { value: 'current_market_inspected', label: 'Current Market - Inspected', group: 'Current Market' },
  { value: 'current_market_desktop', label: 'Current Market - Desktop', group: 'Current Market' },
  // Inheritance Tax
  { value: 'iht_inspected', label: 'IHT - Inspected', group: 'Inheritance Tax (IHT)' },
  { value: 'iht_desktop', label: 'IHT - Desktop', group: 'Inheritance Tax (IHT)' },
  // Auction
  { value: 'auction_inspected', label: 'Auction - Inspected', group: 'Auction' },
  { value: 'auction_desktop', label: 'Auction - Desktop', group: 'Auction' },
  { value: 'ha_current_market_auction', label: 'HA Current Market & Auction', group: 'Auction' },
  // Shared Ownership (ASO)
  { value: 'aso_inspected', label: 'Shared Ownership - Inspected', group: 'Shared Ownership' },
  { value: 'aso_desktop', label: 'Shared Ownership - Desktop', group: 'Shared Ownership' },
  // Portfolio
  { value: 'portfolio_inspected', label: 'Portfolio - Inspected', group: 'Portfolio' },
  { value: 'portfolio_desktop', label: 'Portfolio - Desktop', group: 'Portfolio' },
];
