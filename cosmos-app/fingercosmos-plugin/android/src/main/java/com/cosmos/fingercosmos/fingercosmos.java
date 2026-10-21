package com.cosmos.fingercosmos;

import com.getcapacitor.Logger;

public class fingercosmos {

    public String echo(String value) {
        Logger.info("Echo", value);
        return value;
    }
}
