package com.daybook.scalebridge;
import java.time.*;
public final class MorningWindowCheck {
 static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 public static void main(String[] args){
  java.util.TimeZone original=java.util.TimeZone.getDefault();
  try{java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Riyadh"));check(MorningWindow.deviceZone().equals("Asia/Riyadh"),"phone Riyadh time");java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Shanghai"));check(MorningWindow.deviceZone().equals("Asia/Shanghai"),"follow changed phone timezone");}finally{java.util.TimeZone.setDefault(original);}
  String zone="Asia/Riyadh";
  check(!MorningWindow.includes(Instant.parse("2026-10-27T02:00:00Z"),zone),"05:00 excluded");
  check(MorningWindow.includes(Instant.parse("2026-10-27T02:00:00.001Z"),zone),"after 05:00 included");
  check(MorningWindow.includes(Instant.parse("2026-10-27T08:59:59Z"),zone),"before noon included");
  check(!MorningWindow.includes(Instant.parse("2026-10-27T09:00:00Z"),zone),"noon excluded");
  check(MorningWindow.nextNoon(Instant.parse("2026-10-27T08:59:59Z"),zone).toInstant().equals(Instant.parse("2026-10-27T09:00:00Z")),"today noon");
  check(MorningWindow.nextNoon(Instant.parse("2026-10-27T09:00:00Z"),zone).toInstant().equals(Instant.parse("2026-10-28T09:00:00Z")),"next day at noon");
  check(MorningWindow.nextNoon(Instant.parse("2026-03-07T17:00:00Z"),"America/New_York").toInstant().equals(Instant.parse("2026-03-08T16:00:00Z")),"DST 23 hour day");
  check(MorningWindow.day(Instant.parse("2026-10-27T22:00:00Z"),zone).equals("2026-10-28"),"local day");
  System.out.println("PASS: morning time boundaries, noon scheduling, timezone date and DST");
 }
}
