// reference 1: https://developer.apple.com/documentation/walletpasses/pass
// reference 2: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html#//apple_ref/doc/uid/TP40012195-CH4-SW1
// reference 3: https://developer.apple.com/documentation/walletpasses/creating_the_source_for_a_pass
import { v4 } from 'uuid';

type RGB = `rgb(${number}, ${number}, ${number})`;

export enum PKBarcodeFormat {
  PKBarcodeFormatQR = 'PKBarcodeFormatQR',
  PKBarcodeFormatPDF417 = 'PKBarcodeFormatPDF417',
  PKBarcodeFormatAztec = 'PKBarcodeFormatAztec',
  PKBarcodeFormatCode128 = 'PKBarcodeFormatCode128'
}

export enum PKNumberStyle {
  Decimal = 'PKNumberStyleDecimal',
  Percent = 'PKNumberStylePercent',
  Scientific = 'PKNumberStyleScientific',
  SpellOut = 'PKNumberStyleSpellOut'
}

export enum PKTextAlignment {
  Left = 'PKTextAlignmentLeft',
  Center = 'PKTextAlignmentCenter',
  Right = 'PKTextAlignmentRight',
  Natural = 'PKTextAlignmentNatural'
}

export enum PKDateStyle {
  None = 'PKDateStyleNone',
  Short = 'PKDateStyleShort',
  Medium = 'PKDateStyleMedium',
  Long = 'PKDateStyleLong',
  Full = 'PKDateStyleFull'
}

export enum SupportedLocale {
  EN = 'en',
  ES = 'es',
  JA = 'ja',
  KO = 'ko',
  MS = 'ms',
  ID = 'id',
  TH = 'th',
  ZH_CN = 'zh-Hans',
  ZH_HANS = 'zh-Hans',
  ZH_HANT = 'zh-Hant',
  ZH_HK = 'zh-Hant'
}

type LocaleLabel = Partial<Record<SupportedLocale, string>>;

export enum PKDataDetectorType {
  PhoneNumber = 'PKDataDetectorTypePhoneNumber',
  Link = 'PKDataDetectorTypeLink',
  Address = 'PKDataDetectorTypeAddress',
  CalendarEvent = 'PKDataDetectorTypeCalendarEvent'
}

interface PassFieldContent {
  key: string;
  /**
   * localizable string, ISO 8601 date, or number
   */
  value: string | number;
  /**
   * localizable string, ISO 8601 date, or number
   */
  attributedValue?: string | number;
  /**
   * localizable string
   */
  changeMessage?: string;
  currencyCode?: string;
  dataDetectorTypes?: PKDataDetectorType[];
  dateStyle?: PKDateStyle;
  ignoresTimeZone?: boolean;
  isRelative?: boolean;
  /**
   * localizable string
   */
  label?: string;
  numberStyle?: PKNumberStyle;
  textAlignment?: PKTextAlignment;
  timeStyle?: PKDateStyle
}

interface AuxiliaryField extends PassFieldContent {
  row?: 0 | 1;
}

interface PassFields {
  auxiliaryFields?: AuxiliaryField[];
  backFields?: PassFieldContent[];
  headerFields?: PassFieldContent[];
  primaryFields?: PassFieldContent[];
  secondaryFields?: PassFieldContent[];
}

interface Location {
  latitude: number;
  longitude: number;
  altitude?: number;
  /**
   * localizable string
   */
  relevantText?: string;
}

interface Barcode {
  format: PKBarcodeFormat;
  message: string;
  messageEncoding: 'iso-8859-1';
  altText?: string;
}

interface Beacon {
  proximityUUID: string;
  major?: number;
  minor?: number;
  relevantText?: string;
}

interface Nfc {
  encryptionPublicKey: string;
  message: string;
  requiresAuthentication?: boolean;
}

interface BoardingPass extends PassFields {
  transitType: string;
}

interface PKPassBase {
  passTypeIdentifier: string;
  teamIdentifier: string;
  serialNumber: string;
  /**
   * localizable string
   */
  description: string;
  /**
   * localizable string
   */
  organizationName: string;
  formatVersion?: 1;
}

export interface PKPassInterface extends PKPassBase {
  appLaunchURL?: string;
  associatedStoreIdentifiers?: number[];
  authenticationToken?: string;
  backgroundColor?: RGB;
  barcodes?: Barcode[];
  beacons?: Beacon[];
  boardingPass?: BoardingPass;
  coupon?: PassFields;
  eventTicket?: PassFields;
  expirationDate?: string;
  foregroundColor?: RGB;
  generic?: PassFields;
  groupingIdentifier?: string;
  labelColor?: RGB;
  locations?: Location[];
  /**
   * localizable string
   */
  logoText?: string;
  maxDistance?: number;
  nfc?: Nfc;
  relevantDate?: string;
  // semantics?: any; TODO
  sharingProhibited?: boolean;
  storeCard?: PassFields;
  suppressStripShine?: boolean;
  userInfo?: JSON;
  voided?: boolean;
  webServiceURL?: string;
}

export class PKPass {
  private pkPass: PKPassInterface;
  private translations: Record<string, LocaleLabel> = {};

  constructor({
    ...params
  }: PKPassBase) {
    this.pkPass = {
      formatVersion: 1,
      ...params
    };
  }

  set<K extends keyof PKPassInterface>(key: K, value: PKPassInterface[K]) {
    this.pkPass[key] = value;

    return this;
  }

  get(key) {
    return this.pkPass[key];
  }

  createTranslation(labels: LocaleLabel): string {
    const key = v4();

    while (!this.translations?.[key]) {
      this.translations[key] = labels;
    }

    return key;
  }

  output() {
    let translations: Record<string, string[]> = {};

    Object.keys(this.translations).forEach((key) => {
      Object.keys(this.translations[key]).forEach((locale) => {
        const localeName = `${locale}.lproj`;
        if (!translations?.[localeName]) {
          translations[localeName] = [];
        }

        translations[localeName].push(`"${key}" = "${this.translations[key][locale]}";`);
      });
    })

    return {
      pass: this.pkPass,
      translations
    };
  }
}
