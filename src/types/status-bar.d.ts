import * as React from 'react';

declare module 'react-native' {
  export class StatusBar extends React.Component<any, any> {
    static setBackgroundColor(color: string, animated?: boolean): void;
    static setTranslucent(translucent: boolean): void;
    static setBarStyle(style: any, animated?: boolean): void;
    static setHidden(hidden: boolean, animation?: any): void;
    static currentHeight?: number;
  }
}
