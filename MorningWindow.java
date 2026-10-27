package com.daybook.scalebridge;
import java.time.*;
final class MorningWindow {
    static ZoneId zone(String value){try{return ZoneId.of(value);}catch(Exception e){return ZoneId.of("Asia/Riyadh");}}
    static String day(Instant value,String zone){return value.atZone(zone(zone)).toLocalDate().toString();}
    static boolean includes(Instant value,String zone){LocalTime t=value.atZone(zone(zone)).toLocalTime();return t.isAfter(LocalTime.of(5,0))&&t.isBefore(LocalTime.NOON);}
    static ZonedDateTime nextNoon(Instant now,String zone){ZonedDateTime current=now.atZone(zone(zone)),noon=current.toLocalDate().atTime(LocalTime.NOON).atZone(zone(zone));return noon.toInstant().isAfter(now)?noon:noon.toLocalDate().plusDays(1).atTime(LocalTime.NOON).atZone(zone(zone));}
}
