package com.daybook.scalebridge;

/** Parses the standard Mi Body Composition Scale 2 (0x181B) service payload. */
public final class ScalePacket {
    public final double weightKg;
    public final Integer impedanceOhm;
    private ScalePacket(double weight, Integer impedance) { weightKg=weight; impedanceOhm=impedance; }
    public static boolean removed(byte[] data) { return data!=null && data.length==13 && (data[1]&0x80)!=0; }
    public static ScalePacket parse(byte[] data) {
        if(data==null || data.length!=13 || (data[1]&0x20)==0 || removed(data)) return null;
        int raw=(data[11]&255)|((data[12]&255)<<8);
        double weight;
        if((data[0]&255)==0x02) weight=raw/200.0;
        else if((data[0]&255)==0x03) weight=raw/100.0*0.45359237;
        else return null;
        if(weight<1 || weight>300) return null;
        Integer impedance=null;
        if((data[1]&2)!=0) {
            int value=(data[9]&255)|((data[10]&255)<<8);
            if(value<=0 || value>=3000) return null;
            impedance=value;
        }
        return new ScalePacket(Math.round(weight*100)/100.0,impedance);
    }
}
