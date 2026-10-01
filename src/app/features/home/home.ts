import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideBell,
  LucideBookOpen,
  LucideChartNoAxesColumnIncreasing,
  LucideChevronDown,
  LucideClipboardList,
  LucideGraduationCap,
  LucideHeartHandshake,
  LucideLayoutDashboard,
  LucideLightbulb,
  LucideMessageCircle,
  LucideSchool,
  LucideUsersRound,
  LucideWallet,
} from '@lucide/angular';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideBell,
    LucideBookOpen,
    LucideChartNoAxesColumnIncreasing,
    LucideChevronDown,
    LucideClipboardList,
    LucideGraduationCap,
    LucideHeartHandshake,
    LucideLayoutDashboard,
    LucideLightbulb,
    LucideMessageCircle,
    LucideSchool,
    LucideUsersRound,
    LucideWallet,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {}
