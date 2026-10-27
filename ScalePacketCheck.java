package com.daybook.scalebridge;
public final class ScalePacketCheck {
    static byte[] packet(int flags,int weight,int impedance){byte[] p=new byte[13];p[0]=2;p[1]=(byte)flags;p[9]=(byte)impedance;p[10]=(byte)(impedance>>8);p[11]=(byte)weight;p[12]=(byte)(weight>>8);return p;}
    static void check(boolean ok,String description){if(!ok)throw new AssertionError(description);}
    public static void main(String[] args){
        check(ScalePacket.parse(null)==null,"null");check(ScalePacket.parse(new byte[12])==null,"short");
        check(ScalePacket.parse(packet(0,14000,0))==null,"unstable");check(ScalePacket.parse(packet(0xa0,14000,0))==null,"removed");
        ScalePacket p=ScalePacket.parse(packet(0x20,14000,0));check(p.weightKg==70 && p.impedanceOhm==null,"weight only");
        p=ScalePacket.parse(packet(0x22,14210,512));check(p.weightKg==71.05 && p.impedanceOhm==512,"weight and impedance");
        check(ScalePacket.parse(packet(0x22,14000,65534))==null,"pending impedance");check(ScalePacket.parse(packet(0x22,14000,0))==null,"zero impedance");
        check(ScalePacket.parse(packet(0x20,65535,0))==null,"implausible weight");
        byte[] lbs=packet(0x20,15432,0);lbs[0]=3;check(Math.abs(ScalePacket.parse(lbs).weightKg-70)<.01,"pounds conversion");
        lbs[0]=7;check(ScalePacket.parse(lbs)==null,"unknown units");
        System.out.println("PASS: stable Mi Scale 2 packets, kg/lb, impedance, invalid and removed packets");
    }
}
