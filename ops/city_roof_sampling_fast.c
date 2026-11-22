/* Original optional build-time kernel. Same four-point footprint quadrature and
 * weighted lower median as city_roof_sampling.py; no runtime dependency. */
#include <stdint.h>
#include <stdlib.h>
#include <math.h>
static int inside(double x,double y,const double *p,const int *off,int rings){
 int hit=0;
 for(int r=0;r<rings;r++)for(int i=off[r];i<off[r+1];i++){
  int j=i+1<off[r+1]?i+1:off[r];double ax=p[i*2],ay=p[i*2+1],bx=p[j*2],by=p[j*2+1];
  if((ay>y)!=(by>y))if(x<(bx-ax)*(y-ay)/(by-ay)+ax)hit=!hit;
 }
 return hit;
}
int city_roof_sample(const uint8_t *rgb,const uint8_t *green,int width,int height,
 int64_t ry,int64_t rx,int64_t rc,int64_t gy,int64_t gx,const double *p,const int *off,int rings,int min_brightness,int *out){
 double xmin=p[0],xmax=p[0],ymin=p[1],ymax=p[1];
 for(int i=0;i<off[1];i++){xmin=fmin(xmin,p[i*2]);xmax=fmax(xmax,p[i*2]);ymin=fmin(ymin,p[i*2+1]);ymax=fmax(ymax,p[i*2+1]);}
 int x0=(int)fmax(0,floor(xmin)),x1=(int)fmin(width,ceil(xmax)),y0=(int)fmax(0,floor(ymin)),y1=(int)fmin(height,ceil(ymax));
 if(x1<=x0||y1<=y0)return 0;
 int stride=(int)sqrt((double)(x1-x0)*(y1-y0)/400.);if(stride<1)stride=1;
 int nx=(x1-x0+stride-1)/stride,ny=(y1-y0+stride-1)/stride;
 uint8_t *weights=calloc((size_t)nx*ny,1);if(!weights)return 0;
 int total=0,valid=0,index=0;
 for(int y=y0;y<y1;y+=stride)for(int x=x0;x<x1;x+=stride){
  int w=inside(x+.25,y+.25,p,off,rings)+inside(x+.75,y+.25,p,off,rings)+inside(x+.25,y+.75,p,off,rings)+inside(x+.75,y+.75,p,off,rings);weights[index++]=(uint8_t)w;total+=w;
  int64_t o=(int64_t)y*ry+(int64_t)x*rx;
  if(w&&!green[(int64_t)y*gy+(int64_t)x*gx]&&(int)rgb[o]+(int)rgb[o+rc]+(int)rgb[o+rc*2]>min_brightness*3)valid+=w;
 }
 if(!total){free(weights);return 0;}
 int hist[3][256]={{0}};index=0;
 for(int y=y0;y<y1;y+=stride)for(int x=x0;x<x1;x+=stride){
  int w=weights[index++];if(!w)continue;int64_t o=(int64_t)y*ry+(int64_t)x*rx;
  if(valid&&(green[(int64_t)y*gy+(int64_t)x*gx]||(int)rgb[o]+(int)rgb[o+rc]+(int)rgb[o+rc*2]<=min_brightness*3))continue;
  for(int k=0;k<3;k++)hist[k][rgb[o+rc*k]]+=w;
 }
 int mass=valid?valid:total;
 for(int k=0;k<3;k++){int sum=0;for(int c=0;c<256;c++){sum+=hist[k][c];if(sum*2>=mass){out[k]=c;break;}}}
 free(weights);return 1;
}
