/* Types de l'API Boxtal v3 partagés entre le client (server-only) et les fonctions pures. */

export type BoxtalAddress = {
  type: "RESIDENTIAL" | "BUSINESS";
  contact: { firstName: string; lastName: string; company?: string; email: string; phone: string };
  location: { street: string; number?: string; city: string; postalCode: string; countryIsoCode: string };
  additionalInformation?: string;
};

export type CreateShippingOrderRequest = {
  shippingOfferCode: string;
  labelType?: "PDF_A4" | "PDF_10x15";
  insured?: boolean;
  expectedTakingOverDate?: string;
  shipment: {
    externalId?: string;
    fromAddress: BoxtalAddress;
    toAddress: BoxtalAddress;
    pickupPointCode?: string;
    packages: {
      externalId?: string;
      type: "PARCEL" | "LETTER";
      length: number;
      width: number;
      height: number;
      weight: number;
      value: { value: number; currency: "EUR" };
      content: { id: string; description: string };
    }[];
  };
};

export type ShippingOrder = { id: string; status: "PENDING" | "REQUESTED" | "CONFIRMED" | "CANCELLED"; shipmentId?: string; estimatedDeliveryDate?: string; deliveryPriceExclTax?: { value: number; currency: string } };
export type ShippingDocument = { url: string; type: "LABEL" | "PROFORMA" | "CN23" | "VOUCHER"; format: string };
export type PackageTracking = { status: string; isFinal?: boolean; message?: string; trackingNumber?: string; packageTrackingUrl?: string; trackingDateTime?: string; history?: { status: string; message?: string; trackingDateTime?: string }[] };

