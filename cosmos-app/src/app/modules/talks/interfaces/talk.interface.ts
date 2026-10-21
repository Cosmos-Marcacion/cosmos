export interface IEmployeeResponse {
  _id: string;
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  document?: string;
  signature?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ITalk {
  type: string;
  topic: string;
  summary: string;
  isAnnual: boolean;
  area: string;
  place: string;
  branch: string;
  workerDate: string;
  startTime: string;
  endTime: string;
  hours: number;
  turn: string;
  registerNumber: number;
  trainerId: string;
  registerId: string;
  /** Nombrada de la que sale la charla. Obligatoria al crearla. */
  staffTransmissionId?: string;
}

export interface ITalkResponse {
  _id: string;
  area: string;
  branch: string;
  createdAt: string;
  endTime: string;
  hours: number;
  isAnnual: boolean;
  place: string;
  registerId: string;
  register: IEmployeeResponse;
  registerNumber: number;
  startTime: string;
  summary: string;
  topic: string;
  trainerId: string;
  trainer: IEmployeeResponse;
  turn: string;
  type: string;
  updatedAt: string;
  workerDate: string;
}

export interface IAssistant {
  talkId: string;
  employeeId: string;
}

export interface IAssistantEmployee {
  _id: string;
  name: string;
  document: string;
  signature?: string;
  isAssistant: boolean;
  isAbsence: boolean;
  isEntry: boolean;
  position: string;
}

export interface IAssistantResponse {
  _id: string;
  talk: ITalkResponse;
  employee: IEmployeeResponse;
  createdAt: string;
  updatedAt: string;
}

export interface ITalkFilters {
  startDate: string;
  endDate: string;
  turn: string;
  registerNumber: string;
  type: string;
}

export interface IEmployeeDirect {
  _id: string;
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  document?: string;
  signature?: string;
  status?: string;
  image?: string;
  faceDescriptor?: number[];
  createdAt: string;
  updatedAt: string;
  __v?: number;
}
