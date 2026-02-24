import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

export const COLORS = {
  navy: '#002D5A',
  gold: '#C5A028',
  white: '#FFFFFF',
  gray: '#64748b',
  bg: '#f8fafc',
  border: '#e2e8f0',
};

export const DEFAULT_COURSES = [
  'IPS551',
  'CSC584',
  'ICT551',
  'ICT502',
  'CTU551',
  'TAC451',
  'LCC401',
  'ISP573',
];

const iconSize = 24;
type IconProps = { style?: StyleProp<ViewStyle>; size?: number; color?: string };

export const Icons = {
  Calendar: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="calendar" size={size} color={color} style={style as any} />
  ),
  CheckCircle: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="check-circle" size={size} color={color} style={style as any} />
  ),
  MessageCircle: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="message-circle" size={size} color={color} style={style as any} />
  ),
  Sparkles: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="zap" size={size} color={color} style={style as any} />
  ),
  User: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="user" size={size} color={color} style={style as any} />
  ),
  Bell: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="bell" size={size} color={color} style={style as any} />
  ),
  ArrowRight: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="arrow-right" size={size} color={color} style={style as any} />
  ),
  Plus: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="plus" size={size} color={color} style={style as any} />
  ),
  TrendingUp: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="trending-up" size={size} color={color} style={style as any} />
  ),
  List: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="list" size={size} color={color} style={style as any} />
  ),
  Settings: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="settings" size={size} color={color} style={style as any} />
  ),
  Share: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="share" size={size} color={color} style={style as any} />
  ),
  Mic: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="mic" size={size} color={color} style={style as any} />
  ),
  BookOpen: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="book-open" size={size} color={color} style={style as any} />
  ),
  Layers: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="layers" size={size} color={color} style={style as any} />
  ),
  Lock: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="lock" size={size} color={color} style={style as any} />
  ),
  HelpCircle: ({ style, size = iconSize, color = '#000' }: IconProps) => (
    <Feather name="help-circle" size={size} color={color} style={style as any} />
  ),
};
