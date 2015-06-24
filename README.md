#Note
You need to ask win (at) westtoer.be a required api-key (id and secret) to consume this api directly (not recommended).

##Recommended alternative
The data retrieved by this system is made availabe (together with data from other sources) through the Westtoer datahub at http://datahub.westtoer.be

Contact datahub (at) westtoer.be for more details and access to that.

#Usage
```
nodejs dhubdump.js -o ~/feeds/win/2.0/ -s <<yoursecret>>
```
This will create the datahub LEVEL0 dump from the WIN 2.0 tdms.
The created dump files are named and organized as such:

```
[ROOT]/
  <<type>>-<<pubstate>>.<<format>>
  <<type>>-<<pubstate>>-<<period-from-to>>.<<format>>
  bychannel/
    <<channel>>/
        <<type>>-<<channel>>-pub.<<format>>
```

In this structure the following value-replacements can occur:


key             | possibe values     | meaning
----------------|--------------------|--------
 ```<<type>>```         |...| type of touristic item in the dump
    | accomodation       |   places to stay
    | permanent_offering |   POI and attractions
    | reca               |   places to eat and drink
    | temporary_offering |   events 
    | meetingroom        |   mice info
 ```<<pubstate>>```     |all, pub| publication states of the items in the dump
    | all                |   all items, ignoring their published state
    | pub                |   only items in the published state
 ```<<period-from-to>>```|week, day + YYYYMMDD dates| indicating a subset of last-modified items in the indicated (by name and boundaries) period of time, from date is inclusive, end date is exclusive
    | week-YYYYMMDD-YYYYMMDD |   7 day period, items updated during the week leading up to today
    | day-YYYYMMDD-YYYYMMDD  |   1 day period, items updated during the day
 ```<<format>>```       |xml,  json| file format of the dump
    | xml                |   eXtensible Markup Language
    | json               |   JavaScript Object Notation
 ```<<channel>>```      | 'westtoer', 'brugse_ommeland', 'westhoek', 'de_kust', 'leiestreek', 'fietsen_en_wandelen', 'kenniscentrum', 'dagtrips_voor_groepen', 'flanders_fields', 'meetingkust', 'autoroutes', 'itrip_coast', 'kustwandelroute', 'west-vlinderen', '300_jaar_grens', ...| publication-channel on which the contained items in the dump should be published
 
 
 ##Known Limitations
 
 The api service does not support resultsets above 6000 items.
 In the current state this leads to an error while trying to download all events.
 
```
error reading uri [http://api.westtoer.tdms.acc.saga.be/api/v1/temporary_offering/?format=xml&access_token=***&size=9750] to stream - response.status == 500
```

As a result there are no dump files temporary_offering-all.*